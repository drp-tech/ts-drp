import { IntervalRunner } from "@ts-drp/interval-runner/dist/src/index.js";
import { Logger } from "@ts-drp/logger";
import {
	type DRPIntervalReconnectOptions,
	type DRPNetworkNode,
	type IDRPIntervalReconnectBootstrap,
} from "@ts-drp/types";

export class DRPIntervalReconnectBootstrap implements IDRPIntervalReconnectBootstrap {
	readonly type = "interval:reconnect";
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;

	/** Delegate to handle the actual interval running */
	private _intervalRunner: IntervalRunner;

	/** Logger instance with reconnect-specific prefix */
	private _logger: Logger;

	get id(): string {
		return this._intervalRunner.id;
	}

	/**
	 * Returns the current state of the discovery process
	 */
	get state(): "running" | "stopped" {
		return this._intervalRunner.state;
	}

	constructor(opts: DRPIntervalReconnectOptions) {
		this._logger = new Logger(`drp::reconnect::${opts.id}`, opts.logConfig);
		this._intervalRunner = new IntervalRunner({
			...opts,
			fn: this._runDRPReconnect.bind(this),
		});
		this.networkNode = opts.networkNode;
	}

	start(_args?: [] | undefined): void {
		this._intervalRunner.start();
	}
	stop(): void {
		this._intervalRunner.stop();
	}

	private async _runDRPReconnect(): Promise<boolean> {
		const multiaddrs = this.networkNode.getMultiaddrs();
		if (!multiaddrs) {
			this._logger.info("No multiaddrs to reconnect to");
			return true;
		}
		await this.networkNode.connectBootstrap();
		return true;
	}
}

export function createDRPReconnectBootstrap(
	opts: DRPIntervalReconnectOptions
): DRPIntervalReconnectBootstrap {
	return new DRPIntervalReconnectBootstrap(opts);
}
