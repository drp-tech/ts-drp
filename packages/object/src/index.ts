import * as crypto from "crypto";

export abstract class TopologyObject {
  // TODO generate functions from the abi
  private abi?: string;
  private id?: string;

  constructor(peerId: string) {
    this.abi = "";

    // id = sha256(abi, peer_id, random_nonce)
    this.id = crypto
      .createHash("sha256")
      .update(this.abi)
      .update(peerId)
      .update(Math.floor(Math.random() * Number.MAX_VALUE).toString())
      .digest("hex");
  }

  getObjectAbi(): string {
    return this.abi ?? "";
  }

  getObjectId(): string {
    return this.id ?? "";
  }

  abstract merge(other: TopologyObject): void;
}
