import { App, Plugin, PluginManifest } from 'obsidian';
import { DrawingView, VIEW_TYPE_DRAWING } from './drawing-view';
import { DrawingSettingTab, DEFAULT_SETTINGS, DrawingPluginSettings } from './settings';

export default class DrawingPlugin extends Plugin {
    settings: DrawingPluginSettings;
    async onload() {
        await this.loadSettings();

        // Регистрируем наш тип представления
        this.registerView(
            VIEW_TYPE_DRAWING,
            (leaf) => new DrawingView(leaf, this)
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
        this.addSettingTab(new DrawingSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async openDrawingCanvas() {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_DRAWING,
            active: true,
        });
    }
}