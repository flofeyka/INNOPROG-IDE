import {
	Button,
	Input,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	useDisclosure,
} from "@heroui/react";
import React, { useEffect } from "react";

interface IProps {
	onSendForm: (username?: string) => void;
}

const StartFormModal: React.FC<IProps> = ({ onSendForm }) => {
	const [username, setUsername] = React.useState<string>("");

	const { onOpen, onOpenChange, isOpen } = useDisclosure();

	useEffect(() => {
		// Проверяем localStorage на наличие сохраненного имени
		const savedUsername = localStorage.getItem("innoprog-username");
		if (savedUsername) {
			// Если имя сохранено, сразу отправляем его и не открываем модалку
			onSendForm(savedUsername);
		} else {
			// Если имени нет, открываем модалку
			onOpen();
		}
	}, [onSendForm, onOpen]);

	return (
		<Modal onOpenChange={onOpenChange} isOpen={isOpen}>
			<ModalContent>
				<ModalHeader>Данные</ModalHeader>
				<ModalBody>
					<Input
						placeholder="Введите имя"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
				</ModalBody>
				<ModalFooter>
					<Button
						color="secondary"
						onPress={() => {
							// Сохраняем имя в localStorage
							if (username.trim()) {
								localStorage.setItem("innoprog-username", username.trim());
							}
							onSendForm(username);
						}}
					>
						Далее
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

interface EditUsernameModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSendForm: (username?: string) => void;
	currentUsername?: string;
}

export const EditUsernameModal: React.FC<EditUsernameModalProps> = ({
	isOpen,
	onOpenChange,
	onSendForm,
	currentUsername = "",
}) => {
	const [username, setUsername] = React.useState<string>(currentUsername);

	useEffect(() => {
		setUsername(currentUsername);
	}, [currentUsername]);

	const handleSubmit = () => {
		// Сохраняем имя в localStorage при редактировании
		if (username.trim()) {
			localStorage.setItem("innoprog-username", username.trim());
		}
		onSendForm(username);
		onOpenChange(false);
	};

	return (
		<Modal onOpenChange={onOpenChange} isOpen={isOpen}>
			<ModalContent>
				<ModalHeader>Редактировать имя</ModalHeader>
				<ModalBody>
					<Input
						placeholder="Введите новое имя"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleSubmit();
							}
						}}
					/>
				</ModalBody>
				<ModalFooter>
					<Button
						color="default"
						variant="light"
						onPress={() => onOpenChange(false)}
					>
						Отмена
					</Button>
					<Button color="primary" onPress={handleSubmit}>
						Сохранить
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

export default StartFormModal;
