import DOMPurify from "dompurify";

let container: HTMLDivElement;
const toasts: Map<string, { element: HTMLDivElement; timeoutId?: NodeJS.Timeout }> = new Map();
let counter = 0;

export enum ToastType {
	ERROR = "error",
	SUCCESS = "success",
	INFO = "info",
	WARNING = "warning",
}

export function initializeToastContainer(): void {
	if (!container) {
		container = document.createElement("div");
		container.className = "toast-container";
		document.body.appendChild(container);
	}
}

export function showToast(message: string, type: ToastType = ToastType.ERROR, duration = 5000): void {
	const id = `toast-${++counter}`;
	const toast = document.createElement("div");
	toast.className = `toast ${type}`;
	toast.innerHTML = `
        <div class="toast-icon">${type === ToastType.ERROR ? "⚠️" : type === ToastType.SUCCESS ? "✅" : type === ToastType.INFO ? "ℹ️" : "⚠️"}</div>
        <div class="toast-content">
            <p class="toast-message">${DOMPurify.sanitize(message)}</p>
        </div>
        <button class="toast-close" aria-label="Close">×</button>
    `;

	// Add click handler for close button
	const closeBtn = toast.querySelector(".toast-close");
	if (closeBtn) {
		closeBtn.addEventListener("click", () => removeToast(id));
	}

	// Add to container
	container.appendChild(toast);

	// Ensure the toast is visible before starting the removal timer
	requestAnimationFrame(() => {
		// Store the toast with its timeout ID
		const timeoutId = setTimeout(() => removeToast(id), duration);
		toasts.set(id, { element: toast, timeoutId });
	});
}

function removeToast(id: string): void {
	const toast = toasts.get(id);
	if (toast) {
		// Clear any existing timeout
		if (toast.timeoutId) {
			clearTimeout(toast.timeoutId);
		}

		// Add the removing class to trigger the animation
		toast.element.classList.add("removing");

		// Remove the toast after the animation completes
		setTimeout(() => {
			toast.element.remove();
			toasts.delete(id);
		}, 300); // Match this with the CSS transition duration
	}
}
