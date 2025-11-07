export function updateAnimations(mesh, deltaTime) {
	const ua = mesh.userData;
	if (!ua.activeAnimation || !mesh.geometry || !mesh.geometry.attributes.position) return;

	ua.accumTime = (ua.accumTime || 0) + deltaTime; // Initialize if undefined
	ua.frame = ua.frame || 0; // Initialize if undefined

	const activeAnimation = ua.activeAnimation;
	const frameDuration = activeAnimation.frameTime;
	const totalFrames = activeAnimation.frames.length;

	if (ua.accumTime >= frameDuration) {
		ua.accumTime -= frameDuration;
		ua.frame = (ua.frame + 1) % totalFrames;

		const currentFrameData = activeAnimation.frames[ua.frame];
		if (currentFrameData && currentFrameData.vertices) {
			const positionAttribute = mesh.geometry.attributes.position;
			positionAttribute.copyArray(currentFrameData.vertices);
			positionAttribute.needsUpdate = true;
		}
	}
}

export function cubicEaseInOut(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createMultiPhaseEasingArray(phases, steps) {
	const easingArray = new Array(steps);
	let totalDuration = 0;
	for (const phase of phases) {
		totalDuration += phase.duration;
	}

	let currentStep = 0;
	for (const phase of phases) {
		const phaseSteps = Math.round((phase.duration / totalDuration) * steps);
		for (let i = 0; i < phaseSteps; i++) {
			const t = i / (phaseSteps - 1);
			easingArray[currentStep++] = phase.easing(t);
		}
	}
	// Fill any remaining steps due to rounding
	while (currentStep < steps) {
		easingArray[currentStep++] = phases[phases.length - 1].easing(1);
	}
	return { easingArray };
}
