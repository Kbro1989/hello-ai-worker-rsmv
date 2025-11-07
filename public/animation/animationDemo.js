import { updateAnimations, cubicEaseInOut, createMultiPhaseEasingArray } from './loader.js';

// --- Minimal mesh placeholder ---
const mesh = {
	geometry: { attributes: { position: { array: new Float32Array(6), needsUpdate: false } } },
	userData: { frame: 0, accumTime: 0, blendProgress: 0, blendSpeed: 0.05, activeAnimation: null },
};

// --- Minimal frame helper ---
const createFrame = (offset) => ({ vertices: null, offset });

// --- Walk animation (2 frames) ---
const walk = {
	frames: [createFrame(0), createFrame(1)],
	frameTime: 0.033,
	easingCurve: cubicEaseInOut,
};

// --- Cinematic animation (2 frames, 5-step easing array) ---
const cinematicData = createMultiPhaseEasingArray(
	[
		{ duration: 0.4, easing: (t) => t * t },
		{ duration: 0.2, easing: (t) => 3 * t * t - 2 * t * t * t },
		{ duration: 0.4, easing: (t) => 1 - (1 - t) * (1 - t) },
	],
	5
);

const cinematic = {
	frames: [createFrame(2), createFrame(3)],
	frameTime: 0.033,
	easingCurve: cinematicData.easingArray,
};

// --- Start with walk ---
mesh.userData.activeAnimation = walk;

// --- Animation loop with per-frame easing logs ---
function animate(deltaTime) {
	updateAnimations(mesh, deltaTime);

	const ua = mesh.userData;
	const activeAnim = ua.activeAnimation;

	let easingValue = 0;
	if (Array.isArray(activeAnim.easingCurve)) {
		easingValue = activeAnim.easingCurve[ua.frame] ?? 0;
	} else if (typeof activeAnim.easingCurve === 'function') {
		const t = ua.frame / (activeAnim.frames.length - 1);
		easingValue = activeAnim.easingCurve(t);
	}

	// Log every frame (small demo)
	console.log(`Frame: ${ua.frame}, Easing: ${easingValue.toFixed(3)}, Active: ${activeAnim === cinematic ? 'Cinematic' : 'Walk'}`);

	// Trigger cinematic after first walk cycle
	if (ua.frame === 1 && ua.activeAnimation === walk) {
		ua.activeAnimation = cinematic;
		ua.frame = 0;
		ua.accumTime = 0;
		ua.blendProgress = 0;
	}

	requestAnimationFrame((dt) => animate(dt * 0.001));
}

// --- Start loop ---
animate(0.016);
