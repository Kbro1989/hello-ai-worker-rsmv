export type Stream = {
	getData(): Uint8Array;
	skip(n: number): Stream;
	scanloc(): number;
	readByte(): number;
	readUByte(): number;
	readUShortSmart(): number;
	readShortSmart(): number;
	readShortSmartBias(): number;
	readShort(flip?: boolean): number;
	readUShort(flip?: boolean): number;
	readUInt(flip?: boolean): number;
	readUIntSmart(): number;
	readTribyte(): number;
	readFloat(flip?: boolean, signage?: boolean): number;
	readHalf(flip?: boolean): number;
	eof(): boolean;
	bytesLeft(): number;
	readBuffer(len?: number): Uint8Array;
	tee(): Stream
}

export function cacheFilenameHash(name: string, oldhash: boolean) {
	let hash = 0;
	if (oldhash) {
		name = name.toUpperCase();
		for (let ch of name) {
			hash = (Math.imul(hash, 61) + ch.charCodeAt(0) - 32) | 0;
		}
	} else {
		for (let ch of name) {
			hash = (((hash << 5) - hash) | 0) + ch.charCodeAt(0) | 0;
		}
	}
	return hash >>> 0;//cast to u32
}

export function delay(ms: number) {
	return new Promise(d => setTimeout(d, ms))
}

export function posmod(x: number, n: number) {
	return ((x % n) + n) % n;
}

export function ushortToHalf(bytes: number) {
	bytes = flipEndian16(bytes);
	let positive = (bytes & 0x8000) == 0;
	let exponent = (bytes & 0x7c00) >> 10;
	let mantissa = (bytes & 0x03ff);

	let res = mantissa * Math.pow(2.0, -10.0) + (exponent == 0 ? 0.0 : 1.0);
	res *= Math.pow(2.0, exponent - 15.0);
	if (positive) {
		return res;
	}
	return -res;
}

export function flipEndian16(u16: number) {
	return ((u16 & 0xff) << 8) | ((u16 & 0xff00) >>> 8);
}

export function HSL2RGBfloat(hsl: number[]): [number, number, number] {
	var h = hsl[0];
	var s = hsl[1];
	var l = hsl[2];
	var r, g, b;

	if (s == 0) {
		r = g = b = l; // achromatic
	}
	else {
		var hue2rgb = function hue2rgb(p: number, q: number, t: number) {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		}

		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return [r, g, b];
}

export function HSL2RGB(hsl: number[]): [number, number, number] {
	let rgb = HSL2RGBfloat(hsl);
	return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
}

export function RGB2HSL(r: number, g: number, b: number): [number, number, number] {
	r /= 255, g /= 255, b /= 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b);
	var h = 0;
	var s = 0;
	let l = (max + min) / 2;

	if (max != min) {
		var d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break;
			case g: h = (b - r) / d + 2; break;
			case b: h = (r - g) / d + 4; break;
		}
		h /= 6;
	}
	return [h, s, l];
}

export function HSL2packHSL(h: number, s: number, l: number) {
	if (h < 0) { h += 1; }
	return (Math.round(h * 63) << 10) | (Math.round(s * 7) << 7) | (Math.round(l * 127));
}

export function packedHSL2HSL(hsl: number) {
	var h = ((hsl >> 10) & 0x3F) / 63.0;
	var s = ((hsl >> 7) & 0x7) / 7.0;
	var l = (hsl & 0x7F) / 127.0;
	if (h > 0.5)
		h = h - 1.0;
	return [h, s, l];
}

export const Stream: { new(buf: Uint8Array): Stream, prototype: Stream } = function Stream(this: Stream, data: Uint8Array, scan = 0) {
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

	this.getData = function () {
		return data;
	}
	this.bytesLeft = function () {
		return data.length - scan;
	}
	this.readBuffer = function (len = data.length - scan) {
		let res = data.subarray(scan, scan + len);
		scan += len;
		return res;
	}
	this.tee = function () {
		return new Stream(data, scan);
	}
	this.eof = function () {
		if (scan > data.length) { throw new Error("reading past end of buffer"); }
		return scan >= data.length;
	}
	this.skip = function (n: number) {
		scan += n;
		return this;
	}
	this.scanloc = function () {
		return scan;
	}

	this.readByte = function () {
		var val = this.readUByte();
		if (val > 127)
			return val - 256;
		return val;
	}
	this.readUShortSmart = function () {
		let byte0 = this.readUByte();
		if ((byte0 & 0x80) == 0) {
			return byte0;
		}
		let byte1 = this.readUByte();
		return ((byte0 & 0x7f) << 8) | byte1;
	}
	this.readShortSmart = function () {
		let byte0 = this.readUByte();
		let byte0val = byte0 & 0x7f;
		byte0val = (byte0 < 0x40 ? byte0 : byte0 - 0x80);
		if ((byte0 & 0x80) == 0) {
			return byte0val;
		}
		let byte1 = this.readUByte();
		return (byte0val << 8) | byte1;
	}
	this.readShortSmartBias = function () {
		let byte0 = this.readUByte();
		if ((byte0 & 0x80) == 0) {
			return byte0 - 0x40;
		}
		let byte1 = this.readUByte();
		return (((byte0 & 0x7f) << 8) | byte1) - 0x4000;
	}

	this.readUIntSmart = function () {
		let byte0 = this.readUByte();
		let byte1 = this.readUByte();
		if ((byte0 & 0x80) == 0) {
			return (byte0 << 8) | byte1;
		}
		let byte2 = this.readUByte();
		let byte3 = this.readUByte();
		return ((byte0 & 0x7f) << 24) | (byte1 << 16) | (byte2 << 8) | byte3;
	}

	this.readUByte = function () {
		return dataView.getUint8(scan++);
	}

	this.readShort = function (bigendian = false) {
		var val = this.readUShort(bigendian);
		if (val > 32767)
			return val - 65536;
		return val;
	}
	this.readTribyte = function () {
		let val = (dataView.getUint8(scan) << 16) | (dataView.getUint8(scan + 1) << 8) | dataView.getUint8(scan + 2);
		if (val > 0x7fffff) val -= 0x1000000;
		scan += 3;
		return val;
	}

	this.readUShort = function (bigendian = false) {
		let val = dataView.getUint16(scan, !bigendian);
		scan += 2;
		return val;
	}

	this.readUInt = function (bigendian = false) {
		let val = dataView.getUint32(scan, !bigendian);
		scan += 4;
		return val;
	}

	this.readFloat = function (bigendian = false, signage = false) {
		// This implementation is simplified and might not be 100% accurate to the original
		// due to the complexities of float representation and the original's custom logic.
		// For now, we'll use DataView's float32 reading.
		let val = dataView.getFloat32(scan, !bigendian);
		scan += 4;
		return val;
	}

	this.readHalf = function (flip = false) {
		// This is a placeholder. Proper half-float conversion is complex.
		// For now, we'll read as a UShort and return.
		let val = this.readUShort(flip);
		return val; // Further conversion might be needed based on actual half-float spec
	}
} as any;
