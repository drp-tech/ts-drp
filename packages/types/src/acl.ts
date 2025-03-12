import { type DRPPublicCredential } from "./credentials.js";
import { type IDRP } from "./drp.js";

export enum ACLConflictResolution {
	/**
	 * The grant wins.
	 */
	GrantWins = 0,
	/**
	 * The revoke wins.
	 */
	RevokeWins = 1,
}

export enum ACLGroup {
	/**
	 * The admin group.
	 */
	Admin = "ADMIN",
	/**
	 * The finality group.
	 */
	Finality = "FINALITY",
	/**
	 * The writer group.
	 */
	Writer = "WRITER",
}

export interface PeerPermissions {
	/**
	 * The public credential of the peer.
	 */
	publicKey: DRPPublicCredential;
	/**
	 * The permissions of the peer.
	 */
	permissions: Set<ACLGroup>;
}

export interface IACL extends IDRP {
	/**
	 * Whether the ACL is permissionless.
	 */
	permissionless: boolean;
	/**
	 * Grants a permission to a peer.
	 *
	 * @param senderId - The id of the sender.
	 * @param peerId - The id of the peer.
	 * @param group - The group to grant.
	 * @param publicKey - The public key of the peer.
	 */
	grant(senderId: string, peerId: string, group: ACLGroup): void;
	/**
	 * Revokes a permission from a peer.
	 *
	 * @param senderId - The id of the sender.
	 * @param peerId - The id of the peer.
	 * @param group - The group to revoke.
	 */
	revoke(senderId: string, peerId: string, group: ACLGroup): void;
	/**
	 * Set the public key of a peer.
	 *
	 * @param senderId - The id of the sender.
	 * @param peerId - The id of the peer.
	 * @param key - The public key of the peer.
	 */
	setKey(senderId: string, peerId: string, key: DRPPublicCredential): void;
	/**
	 * Gets the finality signers.
	 */
	query_getFinalitySigners(): Map<string, DRPPublicCredential>;
	/**
	 * Checks if a peer is an admin.
	 *
	 * @param peerId - The id of the peer.
	 */
	query_isAdmin(peerId: string): boolean;
	/**
	 * Checks if a peer is a finality signer.
	 *
	 * @param peerId - The id of the peer.
	 */
	query_isFinalitySigner(peerId: string): boolean;
	/**
	 * Checks if a peer is a writer.
	 *
	 * @param peerId - The id of the peer.
	 */
	query_isWriter(peerId: string): boolean;
	/**
	 * Gets the public key of a peer.
	 *
	 * @param peerId - The id of the peer.
	 */
	query_getPeerKey(peerId: string): DRPPublicCredential | undefined;
}
