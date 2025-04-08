import { useRef, useEffect } from "react";

export function useInterval(callback: () => void, delay: number | null): void {
	const callbackRef = useRef(callback);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		if (delay == null) return;

		const intervalID = setInterval(() => callbackRef.current(), delay);
		return () => clearInterval(intervalID);
	}, [delay]);
}
