/*
This file implements a custom sidebar view for the Obsidian RAG Test Plugin.
It displays a header with a "Prepare Tests" button that, when clicked, will trigger the indexing of test notes and prepare them to be sent to an LLM for test generation.
Below the header, a file tree of test notes with status icons and test result counts is rendered.
*/

import { App, ItemView, WorkspaceLeaf } from 'obsidian';
import type { IndexedNote } from './main';

export const VIEW_TYPE = "rag-test-view";

/**
 * Custom sidebar view for displaying test notes and preparing tests.
 */
export default class TestView extends ItemView {
	pluginData: IndexedNote[];

	/**
	 * Constructs the TestView.
	 * @param leaf The workspace leaf to attach the view.
	 * @param app The Obsidian application instance.
	 * @param pluginData The indexed notes data.
	 */
	constructor(leaf: WorkspaceLeaf, app: App, pluginData: IndexedNote[]) {
		super(leaf);
		this.pluginData = pluginData;
	}

	/**
	 * Returns the view type.
	 * @returns The view type identifier.
	 */
	getViewType(): string {
		return VIEW_TYPE;
	}

	/**
	 * Returns the display text for the view.
	 * @returns The display text.
	 */
	getDisplayText(): string {
		return "Test Dashboard";
	}

	/**
	 * Called when the view is opened; triggers rendering.
	 */
	async onOpen(): Promise<void> {
		this.render();
	}

	/**
	 * Called when the view is closed.
	 * @returns A promise that resolves when the view is closed.
	 */
	async onClose(): Promise<void> {
		// No additional cleanup required.
	}

	/**
	 * Renders the sidebar with a header containing a "Prepare Tests" button,
	 * followed by a file tree of test notes with status icons and test result counts.
	 */
	render(): void {
		const container = this.containerEl;
		container.empty();
		const headerEl = container.createEl('div', { cls: 'test-view-header' });
		const prepareButton = headerEl.createEl('button', { text: 'Prepare Tests' });
		prepareButton.addEventListener('click', () => {
			console.log('Prepare Tests clicked');
			// Here you would call a function to index files and prepare data for the LLM.
		});
		const listEl = container.createEl('ul');
		this.pluginData.forEach((note) => {
			const itemEl = listEl.createEl('li');
			const statusIcon = note.testStatus.testsReady ? '🟢' : '🟡';
			const resultText = note.testStatus.testsReady ? ` (${note.testStatus.passed}/${note.testStatus.total})` : '';
			itemEl.createEl('span', { text: `${statusIcon} ${note.filePath}${resultText}` });
		});
	}
}