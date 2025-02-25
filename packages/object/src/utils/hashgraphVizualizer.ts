import { ObjectSet } from "./objectSet.js";
import { Hash, HashGraph } from "../hashgraph/index.js";

type Direction = "up" | "down" | "left" | "right";

interface Node {
	id: string;
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Edge {
	from: string;
	to: string;
}

interface Shape {
	type: "rect" | "vline" | "hline" | "arrow";
	x: number;
	y: number;
	width?: number;
	height?: number;
	text?: string[];
	dir?: Direction;
}

export class hashGraphVizualizer {
	private nodeWidth = 13;
	private nodeHeight = 3;
	private padding = 4;
	private arrow = "v";

	private topologicalSort(edges: Edge[]): string[] {
		const nodes = new Set<string>();
		const inDegree: Map<string, number> = new Map();
		const graph: Map<string, string[]> = new Map();

		edges.forEach(({ from, to }) => {
			nodes.add(from);
			nodes.add(to);
			if (!graph.has(from)) graph.set(from, []);
			graph.get(from)?.push(to);
			inDegree.set(to, (inDegree.get(to) || 0) + 1);
		});

		const queue: string[] = [];
		nodes.forEach((node) => {
			if (!inDegree.has(node)) queue.push(node);
		});

		const result: string[] = [];
		while (queue.length > 0) {
			const node = queue.shift() as string;
			result.push(node);
			graph.get(node)?.forEach((neighbor) => {
				inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
				if (inDegree.get(neighbor) === 0) queue.push(neighbor);
			});
		}

		return result;
	}

	private assignLayers(edges: Edge[], nodes: string[]): Map<string, number> {
		const layers = new Map<string, number>();
		nodes.forEach((node) => layers.set(node, 0));

		let changed = true;
		while (changed) {
			changed = false;
			edges.forEach(({ from, to }) => {
				if ((layers.get(from) ?? 0) >= (layers.get(to) ?? 0)) {
					layers.set(to, (layers.get(from) ?? 0) + 1);
					changed = true;
				}
			});
		}

		return layers;
	}

	private positionNodes(layers: Map<string, number>): Map<string, Node> {
		const layerMap = new Map<number, string[]>();
		layers.forEach((layer, node) => {
			if (!layerMap.has(layer)) layerMap.set(layer, []);
			layerMap.get(layer)?.push(node);
		});

		const positioned = new Map<string, Node>();
		let y = 0;
		layerMap.forEach((nodesInLayer) => {
			let x = 0;
			nodesInLayer.forEach((node) => {
				positioned.set(node, {
					id: node,
					text: `${node.slice(0, 4)}...${node.slice(-4)}`,
					x: x,
					y: y,
					width: this.nodeWidth,
					height: this.nodeHeight,
				});
				x += this.nodeWidth + this.padding;
			});
			y += this.nodeHeight + 2; // Space for node and edge
		});

		return positioned;
	}

	private generateEdges(edges: Edge[], nodes: Map<string, Node>): Shape[] {
		const shapes: Shape[] = [];
		edges.forEach(({ from, to }) => {
			const fromNode = nodes.get(from) as Node;
			const toNode = nodes.get(to) as Node;

			const startX = fromNode.x + Math.floor(fromNode.width / 2);
			const startY = fromNode.y + fromNode.height;
			const endX = toNode.x + Math.floor(toNode.width / 2);
			const endY = toNode.y;

			// Vertical line from bottom of source to just above target
			for (let y = startY; y < endY - 1; y++) {
				shapes.push({ type: "vline", x: startX, y });
			}

			// Horizontal line at endY - 1 if nodes aren’t aligned
			if (startX !== endX) {
				const minX = Math.min(startX, endX);
				const maxX = Math.max(startX, endX);
				for (let x = minX; x <= maxX; x++) {
					// Check if there is an arrow at this position
					const arrow = shapes.find(
						(shape) => shape.type === "arrow" && shape.x === x && shape.y === endY - 1
					);
					if (!arrow) {
						shapes.push({ type: "hline", x, y: endY - 1 });
					}
				}
			}

			// Arrow just above the target node
			shapes.push({ type: "arrow", x: endX, y: endY - 1, dir: "down" });
		});

		return shapes;
	}

	private render(nodes: Map<string, Node>, edges: Shape[]): string {
		const allShapes = Array.from(nodes.values())
			.map(
				(node) =>
					({
						type: "rect",
						x: node.x,
						y: node.y,
						width: node.width,
						height: node.height,
						text: [node.text],
					}) as Shape
			)
			.concat(edges);

		const maxX = Math.max(...allShapes.map((s) => s.x + (s.width || 0))) + this.padding;
		const maxY = Math.max(...allShapes.map((s) => s.y + (s.height || 0))) + this.nodeHeight;

		const grid: string[][] = Array.from({ length: maxY + 1 }, () => Array(maxX + 1).fill(" "));

		// Draw edges first
		edges.forEach((shape) => {
			if (shape.type === "vline") {
				grid[shape.y][shape.x] = "│";
			} else if (shape.type === "hline") {
				grid[shape.y][shape.x] = "─";
			} else if (shape.type === "arrow") {
				grid[shape.y][shape.x] = this.arrow;
			}
		});

		// Draw nodes on top
		nodes.forEach((node) => {
			for (let dy = 0; dy < node.height; dy++) {
				for (let dx = 0; dx < node.width; dx++) {
					const x = node.x + dx;
					const y = node.y + dy;

					if (dy === 0 || dy === node.height - 1) {
						grid[y][x] = "─";
					} else if (dx === 0 || dx === node.width - 1) {
						grid[y][x] = "│";
					} else if (dy === 1) {
						const textLength = node.text.length;
						const totalPadding = node.width - 2 - textLength;
						const leftPadding = Math.floor(totalPadding / 2);
						const charIndex = dx - 1 - leftPadding;
						grid[y][x] = charIndex >= 0 && charIndex < textLength ? node.text[charIndex] : " ";
					}
				}
			}

			// Draw corners
			grid[node.y][node.x] = "┌";
			grid[node.y][node.x + node.width - 1] = "┐";
			grid[node.y + node.height - 1][node.x] = "└";
			grid[node.y + node.height - 1][node.x + node.width - 1] = "┘";
		});

		return grid.map((row) => row.join("")).join("\n");
	}

	public draw(hashGraph: HashGraph): void {
		const nodes = new ObjectSet<string>();

		const edges: { from: Hash; to: Hash }[] = [];
		for (const v of hashGraph.getAllVertices()) {
			nodes.add(v.hash);
			for (const dep of v.dependencies) {
				edges.push({ from: dep, to: v.hash });
			}
		}

		const sortedNodes = this.topologicalSort(edges);
		const layers = this.assignLayers(edges, sortedNodes);
		const positionedNodes = this.positionNodes(layers);
		const edgeShapes = this.generateEdges(edges, positionedNodes);
		const output = this.render(positionedNodes, edgeShapes);
		console.log(output);
	}
}
