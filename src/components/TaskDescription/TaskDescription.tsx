import React, { useRef, useState } from "react";
import { isDesktop } from "../..";
import { Task } from "../../types/task";

interface TaskDescriptionProps {
	task: Task | null;
}

const TaskDescription: React.FC<TaskDescriptionProps> = ({ task }) => {
	const [height, setHeight] = useState(200);
	const isResizing = useRef(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const startTouchY = useRef(0);
	const windowHeight = window.innerHeight;

	const handleMouseDown = (event: React.MouseEvent) => {
		isResizing.current = true;
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.body.style.overflow = "hidden";
	};

	const handleTouchStart = (event: React.TouchEvent) => {
		if (event.touches.length === 1) {
			isResizing.current = true;
			startTouchY.current = event.touches[0].clientY;
			document.addEventListener("touchmove", handleTouchMove, {
				passive: false,
			});
			document.addEventListener("touchend", handleTouchEnd);
			document.body.style.overflow = "hidden";
		}
	};

	const handleMouseMove = (event: MouseEvent) => {
		if (!isResizing.current) return;

		if (containerRef.current) {
			const containerRect = containerRef.current.getBoundingClientRect();
			const newHeight = event.clientY - containerRect.top;

			const minHeight = 10;
			const maxHeight = windowHeight - 200;
			setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
		}
	};

	const handleTouchMove = (event: TouchEvent) => {
		if (!isResizing.current) return;

		if (containerRef.current) {
			const containerRect = containerRef.current.getBoundingClientRect();
			const newHeight = event.touches[0].clientY - containerRect.top;

			const minHeight = 10;
			const maxHeight = windowHeight - 200;
			setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));

			event.preventDefault();
		}
	};

	const handleMouseUp = () => {
		isResizing.current = false;
		document.removeEventListener("mousemove", handleMouseMove);
		document.removeEventListener("mouseup", handleMouseUp);
		document.body.style.overflow = "";
	};

	const handleTouchEnd = () => {
		isResizing.current = false;
		document.removeEventListener("touchmove", handleTouchMove);
		document.removeEventListener("touchend", handleTouchEnd);
		document.body.style.overflow = "";
	};

	if (!task) return null;

	return (
		<div className={`${!isDesktop() ? "mt-[110px]" : ""}`}>
			<div
				ref={containerRef}
				style={{
					position: "relative",
					height: `${height}px`,
				}}
				className={`flex-none bg-ide-secondary p-4 border-b border-ide-border`}
			>
				<div
					style={{
						overflow: "auto",
						height: "100%",
					}}
				>
					<div className="container mx-auto">
						<div className="prose prose-invert max-w-none">
							<div dangerouslySetInnerHTML={{ __html: task.description }} />
							{task.answers && task.answers.length > 1 && (
								<>
									{task.answers[0].input && (
										<>
											<div>Входные данные:</div>
											<pre>{task.answers[0].input}</pre>
										</>
									)}
									<div className="mt-3">Выходные данные:</div>
									<pre>{task.answers[0].output}</pre>
								</>
							)}
						</div>
					</div>
				</div>

				<div
					style={{
						position: "absolute",
						bottom: 0,
						left: 0,
						right: 0,
						height: "8px",
						cursor: "row-resize",
						userSelect: "none",
					}}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
				>
					<div
						style={{
							width: "60px",
							height: "4px",
							background: "#666",
							margin: "2px auto",
							borderRadius: "2px",
							zIndex: "999",
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default TaskDescription;
