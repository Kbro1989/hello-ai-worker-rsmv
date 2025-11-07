import { simplexteadecrypt } from "./xtea";
import { inflateSync, gunzipSync, deflateSync } from "pako"; // Assuming pako is installed and imported

//decompress data as it comes from the server
export function decompress(input: Uint8Array, key?: Uint32Array) {
	const dataView = new DataView(input.buffer, input.byteOffset, input.byteLength);

	switch (dataView.getUint8(0x0)) {
		case 0:
			return _uncompressed(input);
		case 1:
			throw new Error("BZ2 compression not supported in this environment");
		case 2:
			return _zlib(input, key);
		case 3:
			throw new Error("LZMA compression not supported in this environment");
		case 0x5a: //0x5a4c4201
			return _zlibSqlite(input);
		default:
			throw new Error("Unknown compression type (" + dataView.getUint8(0x0).toString() + ")");
	}
}

//compress data to use in sqlite BLOBs
export function compressSqlite(input: Uint8Array, compression: "zlib") {
	switch (compression) {
		case "zlib":
			return _zlibSqliteCompress(input);
		default:
			throw new Error(`unknown compression type ${compression}`);
	}
}


/**
 * @param {Uint8Array} input The input buffer straight from the server
 */
var _uncompressed = function (input: Uint8Array) {
	const dataView = new DataView(input.buffer, input.byteOffset, input.byteLength);
	var size = dataView.getUint32(0x1, false);
	var output = new Uint8Array(size);
	output.set(input.subarray(0x5, 0x5 + size));
	return output;
}

/**
 * @param {Uint8Array} input The input buffer straight from the server
 */
var _zlib = function (input: Uint8Array, key?: Uint32Array) {
	const dataView = new DataView(input.buffer, input.byteOffset, input.byteLength);
	try {
		let compressedsize = dataView.getUint32(1, false);
		if (key) {
			let compressedData = simplexteadecrypt(input.subarray(5, 5 + 4 + compressedsize), key);
			return gunzipSync(compressedData.subarray(4, 4 + compressedsize));
		} else {
			let compressedData = input.subarray(9, 9 + compressedsize);
			return gunzipSync(compressedData);
		}
	} catch (e) {
		throw new Error(`gzip decompress failed, possibly due to missing or wrong xtea key, key: ${key ?? "none"}`, { cause: e });
	}
}

export function legacyGzip(input: Uint8Array) {
	return gunzipSync(input);
}

function _zlibSqlite(input: Uint8Array) {
	//skip header bytes 5a4c4201
	const dataView = new DataView(input.buffer, input.byteOffset, input.byteLength);
	var uncompressed_size = dataView.getUint32(0x4, false);
	return inflateSync(input.subarray(0x8));
}
function _zlibSqliteCompress(input: Uint8Array) {
	let compressbytes = deflateSync(input);
	let result = new Uint8Array(4 + 4 + compressbytes.byteLength);
	const resultView = new DataView(result.buffer);
	// Write "5a4c4201" in hex
	resultView.setUint32(0x0, 0x5a4c4201, false);
	resultView.setUint32(0x4, input.byteLength, false);
	result.set(compressbytes, 0x8);
	return result;
}
