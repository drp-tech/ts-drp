// Adapted from here: https://github.com/libp2p/js-libp2p-examples/blob/main/examples/js-libp2p-example-chat/src/stream.js
// The MIT License (MIT)
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import type { Stream } from "@libp2p/interface";
import * as lp from "it-length-prefixed";
import map from "it-map";
import { pipe } from "it-pipe";

export async function uint8ArrayToStream(stream: Stream, input: Uint8Array): Promise<void> {
	await pipe(input, (source) => lp.encode([source]), stream.sink);
}

export async function streamToUint8Array(stream: Stream): Promise<Uint8Array> {
	return pipe(
		stream.source,
		(source) => lp.decode(source),
		(source) => map(source, (buf) => buf.subarray()),
		async (source) => {
			const output: Uint8Array[] = [];
			for await (const msg of source) {
				output.push(msg);
			}
			return output[0];
		}
	);
}
