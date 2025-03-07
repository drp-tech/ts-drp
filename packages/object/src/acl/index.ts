import {
	ACLConflictResolution,
	ACLGroup,
	ActionType,
	type DRPPublicCredential,
	type IACL,
	type PeerPermissions,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";

export class ObjectACL implements IACL {
	semanticsType = SemanticsType.pair;

	// if true, any peer can write to the object
	permissionless: boolean;
	private _conflictResolution: ACLConflictResolution;
	private _authorizedPeers: Map<string, PeerPermissions>;

	constructor(options: {
		admins: Map<string, DRPPublicCredential>;
		permissionless?: boolean;
		conflictResolution?: ACLConflictResolution;
	}) {
		this.permissionless = options.permissionless ?? false;

		const permissions = new Set<ACLGroup>([ACLGroup.Admin, ACLGroup.Finality]);
		if (!options.permissionless) {
			permissions.add(ACLGroup.Writer);
		}

		this._authorizedPeers = new Map(
			[...options.admins.entries()].map(([key, value]) => [key, { publicKey: value, permissions }])
		);
		this._conflictResolution = options.conflictResolution ?? ACLConflictResolution.RevokeWins;
	}

	grant(senderId: string, peerId: string, group: ACLGroup, publicKey?: DRPPublicCredential): void {
		if (!this.query_isAdmin(senderId)) {
			throw new Error("Only admin peers can grant permissions.");
		}
		let peerPermissions = this._authorizedPeers.get(peerId);
		if (!peerPermissions) {
			if (!publicKey) {
				throw new Error("Public key required for new peer.");
			}
			peerPermissions = { publicKey, permissions: new Set() };
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

	revoke(senderId: string, peerId: string, group: ACLGroup): void {
		if (!this.query_isAdmin(senderId)) {
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

	query_getFinalitySigners(): Map<string, DRPPublicCredential> {
		return new Map(
			[...this._authorizedPeers.entries()]
				.filter(([_, user]) => user.permissions.has(ACLGroup.Finality))
				.map(([peerId, user]) => [peerId, user.publicKey])
		);
	}

	query_isAdmin(peerId: string): boolean {
		return this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Admin) ?? false;
	}

	query_isFinalitySigner(peerId: string): boolean {
		return this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Finality) ?? false;
	}

	query_isWriter(peerId: string): boolean {
		return (
			this.permissionless ||
			(this._authorizedPeers.get(peerId)?.permissions.has(ACLGroup.Writer) ?? false)
		);
	}

	query_getPeerKey(peerId: string): DRPPublicCredential | undefined {
		return this._authorizedPeers.get(peerId)?.publicKey;
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (!vertices[0].operation || !vertices[1].operation) return { action: ActionType.Nop };
		if (
			vertices[0].operation.opType === vertices[1].operation.opType ||
			vertices[0].operation.value[0] !== vertices[1].operation.value[0]
		)
			return { action: ActionType.Nop };

		return this._conflictResolution === ACLConflictResolution.GrantWins
			? {
					action:
						vertices[0].operation.opType === "grant" ? ActionType.DropRight : ActionType.DropLeft,
				}
			: {
					action:
						vertices[0].operation.opType === "grant" ? ActionType.DropLeft : ActionType.DropRight,
				};
	}
}
