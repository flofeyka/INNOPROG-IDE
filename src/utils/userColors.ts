export const userColors = [
	"#FF6B6B",
	"#4ECDC4",
	"#45B7D1",
	"#96CEB4",
	"#FFEAA7",
	"#DDA0DD",
	"#98D8C8",
	"#F7DC6F",
	"#BB8FCE",
	"#85C1E9",
	"#F8C471",
	"#82E0AA",
	"#F1948A",
	"#85929E",
	"#D7BDE2",
];

export const generateUserColor = (userId: string): string => {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		const char = userId.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return userColors[Math.abs(hash) % userColors.length];
};

export const getContrastColor = (backgroundColor: string): string => {
	const hex = backgroundColor.replace("#", "");
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 155 ? "#000000" : "#FFFFFF";
};
