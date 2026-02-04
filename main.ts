// main.ts - основной файл плагина
import { App, Plugin, TFile, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { DrawingView, VIEW_TYPE_DRAWING } from './drawing-view';
import { DrawingSettingTab } from './settings';

export default class DrawingPlugin extends Plugin {
    async onload() {
        // Регистрируем наш тип представления
        this.registerView(
            VIEW_TYPE_DRAWING,
            (leaf) => new DrawingView(leaf, this as any)
        );

        // Добавляем команды
        this.addCommand({
            id: 'open-drawing-canvas',
            name: 'Открыть холст для рисования',
            callback: () => this.openDrawingCanvas()
        });

        // Добавляем иконку в левую панель
        this.addRibbonIcon('pencil', 'Открыть рисовалку', () => {
            this.openDrawingCanvas();
        });

        // Добавляем настройки
        this.addSettingTab(new DrawingSettingTab(this.app, this as any));
    }

    async openDrawingCanvas() {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_DRAWING,
            active: true,
        });
    }
}