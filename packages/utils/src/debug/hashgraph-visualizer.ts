import type { Hash, IHashGraph } from "@ts-drp/types";

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

/**
 * Visualizes a HashGraph structure in ASCII art format
 * Renders nodes as boxes connected by lines and arrows
 */
export class HashGraphVisualizer {
	private nodeWidth = 13;
	private nodeHeight = 3;
	private padding = 4;
	private arrow = "v";

	/**
	 * Performs a topological sort on the graph in a layered manner
	 * Returns nodes in order where each node appears after all its dependencies
	 * @param edges - Array of edges representing dependencies between nodes
	 * @returns Array of node IDs in topologically sorted order
	 */
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
		let head = 0;
		while (queue.length > 0) {
			const node = queue[head++];
			if (!node) continue;
			result.push(node);
			graph.get(node)?.forEach((neighbor) => {
				inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
				if (inDegree.get(neighbor) === 0) queue.push(neighbor);
			});

			if (head > queue.length / 2) {
				queue.splice(0, head);
				head = 0;
			}
		}

		return result;
	}

	/**
	 * Assigns layer numbers to nodes based on their dependencies
	 * Uses topologically sorted nodes to assign layers in a single pass
	 * Each node's layer will be one more than its highest dependency
	 * @param edges - Array of all edges
	 * @param sortedNodes - Array of node IDs in topological order
	 * @returns Map of node IDs to their assigned layer numbers
	 */
	private assignLayers(edges: Edge[], sortedNodes: string[]): Map<string, number> {
		const layers = new Map<string, number>();
		const dependencies = new Map<string, string[]>();

		edges.forEach(({ from, to }) => {
			if (!dependencies.has(to)) {
				dependencies.set(to, []);
			}
			dependencies.get(to)?.push(from);
		});

		sortedNodes.forEach((node) => layers.set(node, 0));

		sortedNodes.forEach((node) => {
			const deps = dependencies.get(node) || [];
			if (deps.length > 0) {
				const maxDepLayer = Math.max(...deps.map((dep) => layers.get(dep) || 0));
				layers.set(node, maxDepLayer + 1);
			}
		});

		return layers;
	}

	/**
	 * Calculates x,y coordinates for each node based on its layer
	 * Arranges nodes in each layer horizontally with padding
	 * @param layers - Map of node IDs to their layer numbers
	 * @returns Map of node IDs to their position and display information
	 */
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

	/**
	 * Generates shapes representing edges between nodes
	 * Creates vertical lines, horizontal lines, and arrows to show dependencies
	 * @param edges - Array of edges to visualize
	 * @param nodes - Map of node positions
	 * @returns Array of shapes representing the edges
	 */
	private generateEdges(edges: Edge[], nodes: Map<string, Node>): Shape[] {
		const shapes: Shape[] = [];
		const arrowPositions = new Set<string>();

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

			const arrowKey = `${endX},${endY - 1}`;
			// Horizontal line at endY - 1 if nodes aren't aligned
			if (startX !== endX) {
				const minX = Math.min(startX, endX);
				const maxX = Math.max(startX, endX);
				for (let x = minX; x <= maxX; x++) {
					const key = `${x},${endY - 1}`;
					// Check if there is an arrow at this position
					if (!arrowPositions.has(key)) {
						shapes.push({ type: "hline", x, y: endY - 1 });
					}
				}
			}

			// Arrow just above the target node
			shapes.push({ type: "arrow", x: endX, y: endY - 1, dir: "down" });
			arrowPositions.add(arrowKey);
		});

		return shapes;
	}

	/**
	 * Renders the graph visualization as ASCII art
	 * Draws nodes as boxes and connects them with lines and arrows
	 * @param nodes - Map of node positions and display information
	 * @param edges - Array of shapes representing edges
	 * @returns String containing the ASCII art visualization
	 */
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
		const maxY = Math.max(...allShapes.map((s) => s.y + (s.height || 0)));

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
		return grid.map((row) => row.join("").trimEnd()).join("\n");
	}

	/**
	 * Main entry point for visualizing a HashGraph
	 * Processes the graph structure and outputs an ASCII visualization
	 * @param hashGraph - The HashGraph to visualize
	 * @returns String containing the ASCII art visualization
	 */
	public stringify(hashGraph: IHashGraph): string {
		const nodes = new Set<string>();

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
		return this.render(positionedNodes, edgeShapes);
	}
}

/**
 * Visualizes a HashGraph structure in ASCII art format
 * Renders nodes as boxes connected by lines and arrows
 * @param hashGraph - The HashGraph to visualize
 * @returns String containing the ASCII art visualization
 */
export function visualizeHashGraph(hashGraph: IHashGraph): string {
	const viz = new HashGraphVisualizer();
	return viz.stringify(hashGraph);
}
