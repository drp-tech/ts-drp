import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import { GenericRespone, SubscribeDRPRequest } from "../src/proto/drp/node/v1/rpc_pb.js";
import { run } from "../src/runner.js";

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
		await run();
		client = new service.DrpRpcService(`localhost:6969`, grpc.credentials.createInsecure());
	});

	test("test client subscribe drp", async () => {
		const request: SubscribeDRPRequest = {
			drpId: "test-id",
		};
		client.SubscribeDRP(request, (error: grpc.ServiceError, response: GenericRespone) => {
			expect(error).toBeNull();
			console.log(response.returnCode);
		});
	});
});
