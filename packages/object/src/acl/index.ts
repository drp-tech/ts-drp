import {
	ACLConflictResolution,
	ACLGroup,
	ActionType,
	type DrpRuntimeContext,
	type IACL,
	type PeerPermissions,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";

function getPeerPermissions(params?: { blsPublicKey?: string; permissions?: Set<ACLGroup> }): PeerPermissions {
	const { blsPublicKey, permissions } = params ?? {};

	return {
		blsPublicKey: blsPublicKey ?? "",
		permissions: permissions ?? new Set(),
	};
}

export interface ObjectACLOptions {
	admins: string[];
	permissionless?: boolean;
	conflictResolution?: ACLConflictResolution;
}

/**
 * ObjectACL is a class that implements the IACL interface.
 * It represents the ACL for an object in the system.
 */
export class ObjectACL implements IACL {
	semanticsType = SemanticsType.pair;
	context: DrpRuntimeContext = { caller: "" };

	// if true, any peer can write to the object
	permissionless: boolean;
	private _conflictResolution: ACLConflictResolution;
	private _authorizedPeers: Map<string, PeerPermissions>;

	/**
	 * Creates a new ObjectACL instance.
	 * @param options - The options for the ObjectACL.
	 */
	constructor(options: ObjectACLOptions) {
		this.permissionless = options.permissionless ?? false;

		const adminPermissions = new Set<ACLGroup>([ACLGroup.Admin, ACLGroup.Finality]);
		if (!options.permissionless) {
			adminPermissions.add(ACLGroup.Writer);
		}

		this._authorizedPeers = new Map(
			[...options.admins].map((adminId) => [adminId, getPeerPermissions({ permissions: new Set(adminPermissions) })])
		);
		this._conflictResolution = options.conflictResolution ?? ACLConflictResolution.RevokeWins;
	}

	/**
	 * Grants a peer permission to a group.
	 * @param peerId - The ID of the peer to grant permission to.
	 * @param group - The group to grant permission to.
	 */
	grant(peerId: string, group: ACLGroup): void {
		if (!this.query_isAdmin(this.context.caller)) {
			throw new Error("Only admin peers can grant permissions.");
		}
		let peerPermissions = this._authorizedPeers.get(peerId);
		if (!peerPermissions) {
			peerPermissions = getPeerPermissions();
			this._authorizedPeers.set(peerId, peerPermissions);
		}

		switch (group) {
			case ACLGroup.Admin:
				peerPermissions.permissions.add(ACLGroup.Admin);
				break;
			case ACLGroup.Finality:
				peerPermissions.permissions.add(ACLGroup.Finality);
				break;
			case ACLGroup.Writer:
				if (this.permissionless) {
					throw new Error("Cannot grant write permissions to a peer in permissionless mode.");
				}
				peerPermissions.permissions.add(ACLGroup.Writer);
				break;
			default:
				throw new Error("Invalid group.");
		}
	}

	/**
	 * Revokes a peer's permission from a group.
	 * @param peerId - The ID of the peer to revoke permission from.
	 * @param group - The group to revoke permission from.
	 */
	revoke(peerId: string, group: ACLGroup): void {
		if (!this.query_isAdmin(this.context.caller)) {
			throw new Error("Only admin peers can revoke permissions.");
		}
		if (this.query_isAdmin(peerId)) {
			throw new Error("Cannot revoke permissions from a peer with admin privileges.");
		}

		switch (group) {
			case ACLGroup.Admin:
				// currently no way to revoke admin privileges
				break;
			case ACLGroup.Finality:
				this._authorizedPeers.get(peerId)?.permissions.delete(ACLGroup.Finality);
				break;
			case ACLGroup.Writer:
				this._authorizedPeers.get(peerId)?.permissions.delete(ACLGroup.Writer);
				break;
			default:
				throw new Error("Invalid group.");
		}
	}

	/**
	 * Sets the BLS public key for a peer.
	 * @param blsPublicKey - The BLS public key to set.
	 */
	setKey(blsPublicKey: string): void {
		if (!this.query_isFinalitySigner(this.context.caller)) {
			throw new Error("Only finality signers can set their BLS public key.");
		}
		let peerPermissions = this._authorizedPeers.get(this.context.caller);
		if (!peerPermissions) {
			peerPermissions = getPeerPermissions({ blsPublicKey });
		} else {
			peerPermissions.blsPublicKey = blsPublicKey;
		}
		this._authorizedPeers.set(this.context.caller, peerPermissions);
	}

	/**
	 * Returns a map of finality signers and their BLS public keys.
	 * @returns A map of finality signers and their BLS public keys.
	 */
	query_getFinalitySigners(): Map<string, string> {
		return new Map(
			[...this._authorizedPeers.entries()]
				.filter(([_, user]) => user.permissions.has(ACLGroup.Finality))
				.map(([peerId, user]) => [peerId, user.blsPublicKey])
		);
	}

	/**
	 * Checks if a peer is an admin.
	 * @param peerId - The ID of the peer to check.
	 * @returns True if the peer is an admin, false otherwise.
	 */
	query_isAdmin(peerId: string): boolean {
		return this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Admin) ?? false;
	}

	/**
	 * Checks if a peer is a finality signer.
	 * @param peerId - The ID of the peer to check.
	 * @returns True if the peer is a finality signer, false otherwise.
	 */
	query_isFinalitySigner(peerId: string): boolean {
		return this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Finality) ?? false;
	}

	/**
	 * Checks if a peer is a writer.
	 * @param peerId - The ID of the peer to check.
	 * @returns True if the peer is a writer, false otherwise.
	 */
	query_isWriter(peerId: string): boolean {
		return this.permissionless || (this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Writer) ?? false);
	}

	/**
	 * Returns the BLS public key for a peer.
	 * @param peerId - The ID of the peer to get the BLS public key for.
	 * @returns The BLS public key for the peer, or undefined if the peer is not authorized.
	 */
	query_getPeerKey(peerId: string): string | undefined {
		return this._authorizedPeers.get(peerId)?.blsPublicKey;
	}

	/**
	 * Resolves conflicts between two vertices.
	 * @param vertices - The two vertices to resolve conflicts between.
	 * @returns The action to take.
	 */
	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (!vertices[0].operation || !vertices[1].operation) return { action: ActionType.Nop };
		if (vertices[0].operation.opType === "setKey" || vertices[1].operation.opType === "setKey") {
			return { action: ActionType.Nop };
		}
		if (
			vertices[0].operation.opType === vertices[1].operation.opType ||
			vertices[0].operation.value[0] !== vertices[1].operation.value[0]
		)
			return { action: ActionType.Nop };

		return this._conflictResolution === ACLConflictResolution.GrantWins
			? {
					action: vertices[0].operation.opType === "grant" ? ActionType.DropRight : ActionType.DropLeft,
				}
			: {
					action: vertices[0].operation.opType === "grant" ? ActionType.DropLeft : ActionType.DropRight,
				};
	}
}
