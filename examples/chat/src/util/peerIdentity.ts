import { copyToClipboard } from "./clipboard";

const animals = [
	["Arctic Fox", "🦊", "#FF6B6B"],
	["Penguin", "🐧", "#4ECDC4"],
	["Polar Bear", "🐻‍❄️", "#45B7D1"],
	["Wolf", "🐺", "#96CEB4"],
	["Owl", "🦉", "#FFEEAD"],
	["Tiger", "🐯", "#D4A5A5"],
	["Lion", "🦁", "#9B59B6"],
	["Elephant", "🐘", "#3498DB"],
	["Dolphin", "🐬", "#E67E22"],
	["Koala", "🐨", "#1ABC9C"],
	["Panda", "🐼", "#F1C40F"],
	["Unicorn", "🦄", "#E74C3C"],
	["Dragon", "🐲", "#9B59B6"],
	["Kangaroo", "🦘", "#3498DB"],
	["Giraffe", "🦒", "#E67E22"],
	["Zebra", "🦓", "#1ABC9C"],
	["Monkey", "🐒", "#F1C40F"],
	["Gorilla", "🦍", "#E74C3C"],
	["Rhino", "🦏", "#9B59B6"],
	["Hedgehog", "🦔", "#3498DB"],
	["Raccoon", "🦝", "#E67E22"],
	["Llama", "🦙", "#1ABC9C"],
	["Sloth", "🦥", "#F1C40F"],
	["Otter", "🦦", "#E74C3C"],
	["Mandu", "🥟", "#9B59B6"],
];

const maxAnimalsOfOneKind = 100;

const identities: Map<string, { name: string; emoji: string; color: string; number: number }> = new Map();

export function getIdentity(peerId: string): { name: string; emoji: string; color: string; number: number } {
	if (!identities.has(peerId)) {
		let numberHash = hashCode(peerId);
		numberHash = numberHash > 0 ? numberHash : -numberHash;
		const animal = animals[numberHash % animals.length];
		const number = (numberHash % maxAnimalsOfOneKind) + 1;

		identities.set(peerId, {
			name: animal[0],
			emoji: animal[1],
			color: animal[2],
			number: number,
		});
	}
	return identities.get(peerId) ?? { name: "", emoji: "", color: "", number: 0 };
}

export function createPeerNameElement(peerId: string): HTMLSpanElement {
	const identity = getIdentity(peerId);
	const container = document.createElement("span");
	container.className = "peer-name";
	container.style.setProperty("--peer-color", identity.color);
	container.setAttribute("data-peer-color", identity.color);

	const displayName =
		identity.number > 1
			? `${identity.emoji} ${identity.name} #${identity.number}`
			: `${identity.emoji} ${identity.name}`;

	container.innerHTML = `
            ${displayName}
            <span class="peer-id-tooltip">${peerId}</span>
        `;

	return container;
}

export function styleMessageElement(element: HTMLElement, peerId: string): void {
	const identity = getIdentity(peerId);
	element.style.setProperty("--peer-color", identity.color);
	element.setAttribute("data-peer-color", identity.color);
}

export function shortenId(id: string, length = 4): string {
	if (id.length <= length * 2 + 3) return id;
	return `${id.slice(0, length)}...${id.slice(-length)}`;
}

export function formatPeerItem(peerId: string): HTMLSpanElement {
	const identity = getIdentity(peerId);
	const shortId = shortenId(peerId);
	const displayName = `${identity.emoji} ${identity.name} #${identity.number}`;

	const span = document.createElement("span");
	span.className = "peer-name";
	span.style.setProperty("--peer-color", identity.color);
	span.setAttribute("data-peer-color", identity.color);
	span.innerHTML = `${displayName} (${shortId})&nbsp;
            <span class="peer-id-tooltip">${peerId}</span>`;
	span.addEventListener("click", () => {
		void copyToClipboard(peerId);
	});
	return span;
}

const hashCode = (str: string): number => {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
};
