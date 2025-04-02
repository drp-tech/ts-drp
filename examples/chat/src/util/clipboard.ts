import { showToast, ToastType } from "./toast";

export function setupCopyButton(): void {
	const copyButton = document.getElementById("copyButton") as HTMLButtonElement;
	const chatIdElement = document.getElementById("chatId") as HTMLDivElement;

	if (!copyButton || !chatIdElement) return;

	// Initially hide the button
	copyButton.style.display = "none";

	// Function to handle copy
	const copyToClipboard = async (): Promise<void> => {
		const textToCopy = chatIdElement.getAttribute("data-full-id") || "";

		try {
			await navigator.clipboard.writeText(textToCopy);
			copyButton.classList.add("copied");

			// Reset the button state after 2 seconds
			setTimeout(() => {
				copyButton.classList.remove("copied");
			}, 2000);

			showToast("Copied to clipboard!", ToastType.INFO, 2000);
		} catch (_err) {
			// If clipboard API fails, show error toast
			showToast("Failed to copy to clipboard", ToastType.ERROR, 3000);
		}
	};

	// Add click handler
	copyButton.addEventListener("click", () => {
		void copyToClipboard();
	});

	// Create an observer to watch for changes in the chatId element
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === "childList") {
				// Show/hide button based on whether there's content
				const hasContent = chatIdElement.textContent?.trim()?.length ?? 0 > 0;
				copyButton.style.display = hasContent ? "block" : "none";
			}
		});
	});

	// Start observing the chatId element
	observer.observe(chatIdElement, { childList: true });
}

export async function copyToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		showToast("Copied to clipboard!", ToastType.INFO, 2000);
	} catch (_err) {
		showToast("Failed to copy to clipboard", ToastType.ERROR, 3000);
	}
}
