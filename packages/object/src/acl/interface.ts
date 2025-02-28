import type { DRPPublicCredential, DRP } from "../interface.js";

export interface ACL extends DRP {
	permissionless: boolean;
	grant: (
		senderId: string,
		peerId: string,
		group: ACLGroup,
		publicKey?: DRPPublicCredential
	) => void;
	revoke: (senderId: string, peerId: string, group: ACLGroup) => void;
	query_getFinalitySigners: () => Map<string, DRPPublicCredential>;
	query_isAdmin: (peerId: string) => boolean;
	query_isFinalitySigner: (peerId: string) => boolean;
	query_isWriter: (peerId: string) => boolean;
	query_getPeerKey: (peerId: string) => DRPPublicCredential | undefined;
}

export enum ACLConflictResolution {
	GrantWins = 0,
	RevokeWins = 1,
}

export enum ACLGroup {
	Admin = "ADMIN",
	Finality = "FINALITY",
	Writer = "WRITER",
}
export interface PeerPermissions {
	publicKey: DRPPublicCredential;
	permissions: Set<ACLGroup>;
}
