import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import { type GenericRespone, type SubscribeDRPRequest } from "../src/proto/drp/node/v1/rpc_pb.js";
import * as run from "../src/run.js";

const protoPath = path.resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/proto/drp/node/v1/rpc.proto"
);
const packageDefinition = protoLoader.loadSync(protoPath);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const service = protoDescriptor.drp.node.v1;

describe("Run DRP with cli", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let client: any;

	beforeAll(async () => {
		await run.run();
		client = new service.DrpRpcService(`localhost:6969`, grpc.credentials.createInsecure());
	});

	test("test client subscribe drp", () => {
		const request: SubscribeDRPRequest = {
			drpId: "test-id",
		};
		client.SubscribeDRP(request, (error: grpc.ServiceError, response: GenericRespone) => {
			expect(error).toBeNull();
			console.log(response.returnCode);
		});
	});
});
