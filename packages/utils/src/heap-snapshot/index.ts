import * as fs from "fs";
import * as oboe from "oboe";

export type NodeType =
	| "hidden"
	| "array"
	| "string"
	| "object"
	| "code"
	| "closure"
	| "regexp"
	| "number"
	| "native"
	| "synthetic"
	| "concatenated string"
	| "sliced string"
	| "symbol"
	| "bigint"
	| "object shape"
	| "wasm object";
export type EdgeType = "context" | "element" | "property" | "internal" | "hidden" | "shortcut" | "weak";

type NodeTypeTypes = [
	"hidden",
	"array",
	"string",
	"object",
	"code",
	"closure",
	"regexp",
	"number",
	"native",
	"synthetic",
	"concatenated string",
	"sliced string",
	"symbol",
	"bigint",
	"object shape"?,
	"wasm object"?,
];

type MetaData = {
	readonly node_fields: ["type", "name", "id", "self_size", "edge_count", "trace_node_id", "detachedness"?];
	readonly node_types: [NodeTypeTypes, "string", "number", "number", "number", "number", "number"?];
	readonly edge_fields: ["type", "name_or_index", "to_node"];
	readonly edge_types: [
		["context", "element", "property", "internal", "hidden", "shortcut", "weak"],
		"string_or_number",
		"node",
	];
	readonly trace_function_info_fields: ["function_id", "name", "script_name", "script_id", "line", "column"];
	readonly trace_node_fields: ["id", "function_info_index", "count", "size", "children"];
	readonly sample_fields: ["timestamp_us", "last_assigned_id"];
	readonly location_fields: ["object_index", "script_id", "line", "column"];
};

type RawSnapshotData = {
	readonly snapshot: {
		readonly meta: MetaData;
		readonly node_count: number;
		readonly edge_count: number;
		readonly trace_function_count: number;
	};
	readonly nodes: number[];
	readonly edges: number[];
	readonly strings: string[];
	readonly trace_function_infos: unknown[];
	readonly trace_tree: unknown[];
	readonly samples: unknown[];
	readonly location_fields: unknown[];
};

function hasDetachedness(data: RawSnapshotData): boolean {
	return data.snapshot.meta.node_fields.length >= 7;
}

interface ParseInfo {
	nodeFieldCount: number;
	edgeFieldCount: number;
}

function parseInfoFromSnapshot(data: RawSnapshotData): ParseInfo {
	return {
		nodeFieldCount: data.snapshot.meta.node_fields.length,
		edgeFieldCount: data.snapshot.meta.edge_fields.length,
	};
}

class Optional<T> {
	constructor(public readonly value: T) {}
}

function opt<T>(x: T): Optional<T> {
	return new Optional(x);
}

type ExcludeType<T, U> = T extends U ? never : T;

type UndefinedAsOptional<T> = [undefined] extends [T]
	? Optional<ExcludeType<T, undefined>>
	: T extends string
		? T
		: {
				[Property in keyof T]-?: UndefinedAsOptional<T[Property]>;
			};

const nodeTypeTypesProto: UndefinedAsOptional<NodeTypeTypes> = [
	"hidden",
	"array",
	"string",
	"object",
	"code",
	"closure",
	"regexp",
	"number",
	"native",
	"synthetic",
	"concatenated string",
	"sliced string",
	"symbol",
	"bigint",
	opt("object shape"),
	opt("wasm object"),
];

const metaDataProto: UndefinedAsOptional<MetaData> = {
	node_fields: ["type", "name", "id", "self_size", "edge_count", "trace_node_id", opt("detachedness")],
	node_types: [nodeTypeTypesProto, "string", "number", "number", "number", "number", opt("number")],
	edge_fields: ["type", "name_or_index", "to_node"],
	edge_types: [
		["context", "element", "property", "internal", "hidden", "shortcut", "weak"],
		"string_or_number",
		"node",
	],
	trace_function_info_fields: ["function_id", "name", "script_name", "script_id", "line", "column"],
	trace_node_fields: ["id", "function_info_index", "count", "size", "children"],
	sample_fields: ["timestamp_us", "last_assigned_id"],
	location_fields: ["object_index", "script_id", "line", "column"],
};

function assertX(desc: string, cond: boolean): void {
	if (!cond) {
		throw new Error(desc);
	}
}
function assertObject(path: string, x: unknown): void {
	assertX(`${path} is not an object, but is ${typeof x}`, typeof x === "object" && x !== null);
}

function assertArray<T>(path: string, arr: T[]): void {
	assertX(`${path} is not an array, but is '${typeof arr}'`, Array.isArray(arr));
}

function assertInteger(path: string, n: number): void {
	assertX(`${path} is not an integer, but is '${typeof n}'`, Number.isInteger(n));
}

function assertLength(name: string, len: number, expectedLen: number): void {
	if (len !== expectedLen) {
		throw new Error(`Expected ${expectedLen} ${name}, but got ${len}`);
	}
}

type GenericMetaData<Additionals> =
	| GenericMetaData<Additionals>[]
	| string
	| { readonly [p: string]: GenericMetaData<Additionals> }
	| Additionals;

function checkMetaData(
	path: string,
	data: GenericMetaData<undefined>,
	proto: GenericMetaData<Optional<string>>
): boolean {
	let ok = true;
	if (proto instanceof Optional) {
		if (data !== undefined) {
			ok = checkMetaData(path, data, proto.value);
		}
	} else if (typeof proto === "string") {
		if (proto !== data) {
			console.warn(`Expected '${path}' to be '${proto}' but was '${data}'!`);
			ok = false;
		}
	} else if (Array.isArray(proto)) {
		if (!Array.isArray(data)) {
			console.warn(`Expected '${path}' to be an array but was ${JSON.stringify(data)}!`);
			return false;
		}
		if (data.length > proto.length) {
			console.warn(`Array at '${path}' has ${data.length - proto.length} new element(s)!`);

			for (let idx = proto.length; idx < data.length; ++idx) {
				console.warn(`- At index ${idx}: ${JSON.stringify(data[idx])}`);
			}

			// Consider if this should be ok = false; depending on strictness needed
		}

		// Check only up to the length of the shorter array if data is shorter than proto
		const checkLength = Math.min(data.length, proto.length);
		for (let idx = 0; idx < checkLength; ++idx) {
			ok = checkMetaData(`${path}[${idx}]`, data[idx], proto[idx]) && ok;
		}
	} else {
		// Check if data is a non-null object before iterating
		if (typeof data !== "object" || data === null || Array.isArray(data)) {
			console.warn(`Expected '${path}' to be an object but was ${JSON.stringify(data)}!`);
			return false;
		}
		// Ensure data has the properties defined in proto
		for (const prop in proto) {
			// Check if data actually has the property before accessing it
			if (Object.prototype.hasOwnProperty.call(data, prop)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				ok = checkMetaData(`${path}.${prop}`, (data as any)[prop], proto[prop]) && ok;
			} else if (!(proto[prop] instanceof Optional)) {
				// Property is missing in data but required in proto
				console.warn(`Missing property '${path}.${prop}'!`);
				ok = false;
			}
		}
	}

	return ok;
}

function sanityCheck(data: RawSnapshotData): void {
	// assert root
	assertObject("data", data);

	// assert root properties
	assertArray("data.nodes", data.nodes);
	assertArray("data.edges", data.edges);
	assertArray("data.strings", data.strings);
	assertArray("data.trace_function_infos", data.trace_function_infos);
	assertArray("data.trace_tree", data.trace_tree);
	assertArray("data.samples", data.samples);

	// assert snapshot
	const snapshot = data.snapshot;
	assertObject("data.snapshot", snapshot);
	assertInteger("data.snapshot.node_count", snapshot.node_count);
	assertInteger("data.snapshot.edge_count", snapshot.edge_count);
	assertInteger("data.snapshot.trace_function_count", snapshot.trace_function_count);

	const meta = snapshot.meta;
	assertObject("data.snapshot.meta", snapshot.meta);
	assertX(
		"data.snapshot.meta.node_fields must have same length as data.snapshot.meta.node_types",
		meta.node_fields.length === meta.node_types.length
	);
	assertX(
		"data.snapshot.meta.edge_fields must have same length as data.snapshot.meta.edge_types",
		meta.edge_fields.length === meta.edge_types.length
	);

	// assert ParseInfo
	const parseInfo = parseInfoFromSnapshot(data);
	assertX(`expected at least 6 node fields, but got ${parseInfo.nodeFieldCount}`, parseInfo.nodeFieldCount >= 6);
	assertLength("edge fields", parseInfo.edgeFieldCount, 3);

	const ok = checkMetaData("data.snapshot.meta", meta, metaDataProto);
	if (!ok) {
		console.error("Heapsnapshot format check reported issues! Please review warnings.");
		console.error(
			"Check for potential format changes or report issues if necessary: https://github.com/SrTobi/v8-heapsnapshot/issues"
		);
		// Decide if execution should stop here based on strictness requirements
		// throw new Error("Heapsnapshot format check failed!");
	}

	// assert element counts only if counts are non-negative
	if (snapshot.node_count >= 0 && meta.node_fields?.length > 0) {
		assertLength("node elements", data.nodes.length, snapshot.node_count * meta.node_fields.length);
	} else if (snapshot.node_count < 0) {
		console.warn(`Negative node_count (${snapshot.node_count}) found.`);
	} else if (!meta.node_fields) {
		console.warn(`node_fields array is missing or empty.`);
	}

	if (snapshot.edge_count >= 0 && meta.edge_fields?.length > 0) {
		assertLength("edge elements", data.edges.length, snapshot.edge_count * meta.edge_fields.length);
	} else if (snapshot.edge_count < 0) {
		console.warn(`Negative edge_count (${snapshot.edge_count}) found.`);
	} else if (!meta.edge_fields) {
		console.warn(`edge_fields array is missing or empty.`);
	}

	if (snapshot.trace_function_count >= 0 && meta.trace_function_info_fields?.length > 0) {
		assertLength(
			"trace function elements",
			data.trace_function_infos.length,
			snapshot.trace_function_count * meta.trace_function_info_fields.length
		);
	} else if (snapshot.trace_function_count < 0) {
		console.warn(`Negative trace_function_count (${snapshot.trace_function_count}) found.`);
	} else if (!meta.trace_function_info_fields) {
		console.warn(`trace_function_info_fields array is missing or empty.`);
	}
}

export interface Node {
	readonly type: NodeType;
	readonly name: string;
	readonly id: number;
	readonly self_size: number;
	readonly edge_count: number;
	readonly trace_node_id: number;
	readonly detached?: boolean;

	readonly out_edges: Edge[];
	readonly in_edges: Edge[];

	toLongString(): string;
	print(deep?: number, indent?: number, edge_prefix?: string): void;
}

class NodeImpl implements Node {
	constructor(
		public readonly type: NodeType,
		public readonly name: string,
		public readonly id: number,
		public readonly self_size: number,
		public readonly edge_count: number,
		public readonly trace_node_id: number,
		public readonly detached?: boolean
	) {}

	out_edges: Edge[] = [];
	in_edges: Edge[] = [];

	toString(): string {
		return `${this.name}[${this.type}]@${this.id}`;
	}

	toLongString(): string {
		return `${this.name}[${this.type}]@${this.id}{${this.out_edges.join(", ")}}`;
	}

	print(deep: number = 2, indent: number = 0, edge_prefix?: string): void {
		console.log("|" + Array(indent + 1).join("  ") + (edge_prefix || "") + this.toString());

		if (deep > 0) {
			for (const e of this.out_edges) {
				e.to.print(deep - 1, indent + 1, `[${e.type}]${e.name} -> `);
			}
		}
	}
}

export interface Edge {
	readonly type: EdgeType;
	readonly name: string | number;
	readonly from: Node;
	readonly to: Node;

	toLongString(): string;
}

class EdgeImpl implements Edge {
	constructor(
		public readonly type: EdgeType,
		public readonly name: string | number,
		public readonly from: Node,
		public readonly to: Node
	) {}

	toString(): string {
		return `[${this.type}]${this.name} -> ${this.to}`;
	}

	toLongString(): string {
		return `[${this.type}]${this.name} -> ${this.to.toLongString()}`;
	}
}

export interface Snapshot {
	readonly nodes: Node[];
	readonly edges: Edge[];

	readonly global: Node;
	readonly modules: Node[];

	readonly hasDetachedness: boolean;

	findNodeById(id: number): Node | undefined;
}

class SnapshotImpl implements Snapshot {
	idToNodeMapping: Map<number, Node> = new Map();
	_global: Node | undefined;
	_modules: Node[] | undefined;

	constructor(
		public nodes: Node[],
		public edges: Edge[],
		public hasDetachedness: boolean
	) {
		nodes.forEach((node) => this.idToNodeMapping.set(node.id, node));
	}

	findNodeById(id: number): Node | undefined {
		return this.idToNodeMapping.get(id);
	}

	get global(): Node {
		if (!this._global) {
			const foundGlobal = this.nodes.find((node) => node.name === "global / ");

			if (!foundGlobal) {
				throw new Error("Could not find global object!");
			}
			this._global = foundGlobal;
		}
		return this._global;
	}

	get modules(): Node[] {
		if (!this._modules) {
			this._modules = this.nodes.filter((node) => node.name === "Module" && node.type === "object");
		}
		return this._modules;
	}
}

function access<T>(arr: number[], idx: number, baseIdx: number, length: number, f: (num: number) => T): T | undefined {
	return idx - baseIdx < length ? f(arr[idx]) : undefined;
}

function parseNodes(data: RawSnapshotData, parseInfo: ParseInfo): NodeImpl[] {
	const nodes = data.nodes;
	const strings = data.strings;
	const types = data.snapshot.meta.node_types[0];
	const result: NodeImpl[] = [];
	const nodeFieldCount = parseInfo.nodeFieldCount;

	for (let nodeIndex = 0; nodeIndex < data.snapshot.node_count; ++nodeIndex) {
		const baseIndex = nodeIndex * nodeFieldCount;
		let dataIndex = baseIndex;

		const typeIndex = nodes[dataIndex++];
		const nodeType = types[typeIndex];
		if (nodeType === undefined) {
			throw new Error(`Invalid node type index ${typeIndex} at node index ${nodeIndex}`);
		}

		const node = new NodeImpl(
			nodeType,
			strings[nodes[dataIndex++]],
			nodes[dataIndex++],
			nodes[dataIndex++],
			nodes[dataIndex++],
			nodes[dataIndex++],
			access(nodes, dataIndex++, baseIndex, nodeFieldCount, (num) => num === 1)
		);
		result.push(node);
	}
	return result;
}

function parseAndWireEdges(data: RawSnapshotData, nodes: NodeImpl[], parseInfo: ParseInfo): Edge[] {
	const result: Edge[] = [];
	const edges = data.edges;
	const strings = data.strings;
	const types = data.snapshot.meta.edge_types[0];

	function name_or_index(type: EdgeType, i: number): number | string {
		if (type === "element" || type === "hidden") {
			return i;
		}
		if (i >= strings.length) {
			console.warn(`Invalid string index ${i} encountered for edge name/index. Max index: ${strings.length - 1}`);
			return `invalid_string_index_${i}`;
		}
		return strings[i];
	}

	const nodeFieldCount = parseInfo.nodeFieldCount;
	let edgeIndex = 0;
	nodes.forEach((from_node, from_node_idx) => {
		for (let edgeCount = 0; edgeCount < from_node.edge_count; ++edgeCount) {
			if (edgeIndex + 2 >= edges.length) {
				throw new Error(
					`Edge data array ended prematurely. Expected more data for node ${from_node.id} (index ${from_node_idx}), edge ${edgeCount + 1}/${from_node.edge_count}. Current edge index: ${edgeIndex}`
				);
			}

			const typeIndex = edges[edgeIndex++];
			const type = types[typeIndex];
			if (type === undefined) {
				throw new Error(`Invalid edge type index ${typeIndex} at edge index ${edgeIndex - 1} for node ${from_node.id}`);
			}

			const nameIndex = edges[edgeIndex++];
			const name = name_or_index(type, nameIndex);

			const toNodeFieldIndex = edges[edgeIndex++];
			const to_node_index = toNodeFieldIndex / nodeFieldCount;

			if (!Number.isInteger(to_node_index) || to_node_index < 0 || to_node_index >= nodes.length) {
				throw new Error(
					`Invalid to_node index ${to_node_index} (derived from field index ${toNodeFieldIndex}) at edge index ${edgeIndex - 1} for node ${from_node.id}`
				);
			}
			const to_node = nodes[to_node_index];

			const edge = new EdgeImpl(type, name, from_node, to_node);
			result.push(edge);
			from_node.out_edges.push(edge);
			to_node.in_edges.push(edge);
		}
	});
	if (edgeIndex !== data.edges.length) {
		console.warn(
			`Edge data array length mismatch. Expected to consume ${data.edges.length} elements, but consumed ${edgeIndex}.`
		);
	}
	return result;
}

export async function parseSnapshot(arg1: fs.ReadStream | string | object): Promise<Snapshot> {
	let data: RawSnapshotData;
	if (typeof arg1 === "string") {
		try {
			data = JSON.parse(arg1) as RawSnapshotData;
		} catch (e) {
			console.error("Failed to parse snapshot from string:", e);
			throw new Error(`Failed to parse snapshot JSON string: ${e instanceof Error ? e.message : String(e)}`);
		}
	} else if (arg1 instanceof fs.ReadStream) {
		data = await new Promise<RawSnapshotData>((resolve, reject) => {
			oboe
				.default(arg1)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.node("!", (parsedData: any) => resolve(parsedData as RawSnapshotData))
				.fail(reject);
		});
	} else if (typeof arg1 === "object" && arg1 !== null) {
		data = arg1 as RawSnapshotData;
	} else {
		throw new Error(`Illegal snapshot data type: ${typeof arg1}`);
	}

	sanityCheck(data);

	const parseInfo = parseInfoFromSnapshot(data);
	const nodes = parseNodes(data, parseInfo);
	const edges = parseAndWireEdges(data, nodes, parseInfo);

	return new SnapshotImpl(nodes, edges, hasDetachedness(data));
}

export async function parseSnapshotFromFile(
	filename: fs.PathLike,
	options?:
		| BufferEncoding
		| {
				flags?: string | undefined;
				encoding?: BufferEncoding | undefined;
				fd?: number | fs.promises.FileHandle | undefined;
				mode?: number | undefined;
				autoClose?: boolean | undefined;
				emitClose?: boolean | undefined;
				start?: number | undefined;
				highWaterMark?: number | undefined;
				end?: number | undefined;
		  }
): Promise<Snapshot> {
	const stream = fs.createReadStream(filename, options);
	return parseSnapshot(stream);
}
