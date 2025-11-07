import * as opcode_reader from "./rsmv_parser_core";
import type { CacheFileSource } from "cache";

// Import typedef and models JSON schemas directly
import typedefContent from "./opcodes/typedef.jsonc";
import modelsContent from "./opcodes/models.jsonc";




//alloc a large static buffer to write data to without knowing the data size
//then copy what we need out of it
//the buffer is reused so it saves a ton of buffer allocs
const scratchbuf = new Uint8Array(2 * 1024 * 1024);
const scratchdataview = new DataView(scratchbuf.buffer);


let bytesleftoverwarncount = 0;

export class FileParser<T> {
	private parserPromise: Promise<opcode_reader.ChunkParser>;
	totaltime = 0;

    private constructor(parserPromise: Promise<opcode_reader.ChunkParser>) {
        this.parserPromise = parserPromise;
    }

    static async init<T>(opcodeobj: unknown, typedef: opcode_reader.TypeDef): Promise<FileParser<T>> {
        const parser = await opcode_reader.buildParser(null, opcodeobj, typedef);
        return new FileParser<T>(Promise.resolve(parser));
    }

    async getParser(): Promise<opcode_reader.ChunkParser> {
        return this.parserPromise;
    }

	async readInternal(state: opcode_reader.DecodeState) {
		let t = performance.now();
		const parser = await this.getParser();
		let res = parser.read(state);
		this.totaltime += performance.now() - t;
		if (state.scan != state.endoffset) {
			bytesleftoverwarncount++;
			if (bytesleftoverwarncount < 100) {
				console.log(`bytes left over after decoding file: ${state.endoffset - state.scan}`);
			}
			if (bytesleftoverwarncount == 100) {
				console.log("too many bytes left over warning, no more warnings will be logged");
			}
			if (state.buffer.byteLength < 100000) {
				throw new Error(`bytes left over after decoding file: ${state.endoffset - state.scan}`);
			}
		}
		return res;
	}

	read(buffer: Uint8Array, source: CacheFileSource, args?: Record<string, any>) {
        console.log('FileParser.read - source (v2): ', source);
		let state: opcode_reader.DecodeState = {
			isWrite: false,
			buffer,
			dataView: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength),
			stack: [],
			hiddenstack: [],
			scan: 0,
			endoffset: buffer.byteLength,
			args: {
				...(source && source.getDecodeArgs ? source.getDecodeArgs() : {}),
				...args
			}
		};
		return this.readInternal(state) as T;
	}

	async write(obj: T, args?: Record<string, any>) {
		let state: opcode_reader.EncodeState = {
			isWrite: true,
			stack: [],
			hiddenstack: [],
			buffer: scratchbuf,
			dataView: scratchdataview,
			scan: 0,
			endoffset: scratchbuf.byteLength,
			args: {
				clientVersion: 1000,//TODO
				...args
			}
		};
		const parser = await this.getParser();
		parser.write(state, obj);
		if (state.scan > state.endoffset) { throw new Error("tried to write file larger than scratchbuffer size"); }
		scratchbuf.set(scratchbuf.subarray(state.scan, state.endoffset), state.endoffset - (state.scan - state.endoffset)); // Adjust copyWithin for Uint8Array
		state.scan += scratchbuf.byteLength - state.endoffset;
		let r: Uint8Array = scratchbuf.slice(0, state.scan);
		scratchbuf.fill(0, 0, state.scan);
		return r;
	}
}
