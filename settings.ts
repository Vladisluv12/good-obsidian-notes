import { App, PluginSettingTab, Setting } from 'obsidian';
import DrawingPlugin from './main';

export interface DrawingPluginSettings {
    defaultQuality: 'normal' | 'high' | 'ultra';
    exportDPI: number;
    enableAntialiasing: boolean;
    enableHighDPICanvas: boolean;
    gridColor: string;
    dotColor: string;
    defaultPageStyle: 'blank' | 'grid' | 'dots';
    autoSaveInterval: number;
    defaultBrushSize: number;
    defaultEraserSize: number;
    saveFolder: string;
    projectFolder: string;
    lastProjectPath: string;
}

export const DEFAULT_SETTINGS: DrawingPluginSettings = {
    defaultQuality: 'high',
    exportDPI: 300,
    enableAntialiasing: true,
    enableHighDPICanvas: true,
    gridColor: '#e0e0e0',
    dotColor: '#e0e0e0',
    defaultPageStyle: 'grid',
    autoSaveInterval: 30, // секунды
    defaultBrushSize: 2,
    defaultEraserSize: 10,
    saveFolder: 'Drawings',
    projectFolder: 'DrawingProjects',
    lastProjectPath: ''
};

export class DrawingSettingTab extends PluginSettingTab {
    plugin: DrawingPlugin;

    constructor(app: App, plugin: DrawingPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Настройки рисовалки' });

        new Setting(containerEl)
            .setName('Качество по умолчанию')
            .setDesc('Качество холста для рисования')
            .addDropdown(dropdown => dropdown
                .addOption('normal', 'Нормальное')
                .addOption('high', 'Высокое')
                .addOption('ultra', 'Ультра')
                .setValue(this.plugin.settings.defaultQuality)
                .onChange(async (value: 'normal' | 'high' | 'ultra') => {
                    this.plugin.settings.defaultQuality = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('DPI для экспорта')
            .setDesc('Качество экспорта в PDF (рекомендуется 300 для печати)')
            .addSlider(slider => slider
                .setLimits(150, 600, 50)
                .setValue(this.plugin.settings.exportDPI)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.exportDPI = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Сглаживание (антиалиасинг)')
            .setDesc('Включить сглаживание линий')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAntialiasing)
                .onChange(async (value) => {
                    this.plugin.settings.enableAntialiasing = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('HiDPI Canvas')
            .setDesc('Использовать высокое разрешение для Retina дисплеев')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHighDPICanvas)
                .onChange(async (value) => {
                    this.plugin.settings.enableHighDPICanvas = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Цвет сетки')
            .setDesc('Цвет линий сетки')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.gridColor)
                .onChange(async (value) => {
                    this.plugin.settings.gridColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Цвет точек')
            .setDesc('Цвет точек на точечном фоне')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.dotColor)
                .onChange(async (value) => {
                    this.plugin.settings.dotColor = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Стиль страницы по умолчанию')
            .setDesc('Какой фон использовать по умолчанию')
            .addDropdown(dropdown => dropdown
                .addOption('blank', 'Чистая')
                .addOption('grid', 'Клетка')
                .addOption('dots', 'Точки')
                .setValue(this.plugin.settings.defaultPageStyle)
                .onChange(async (value: 'blank' | 'grid' | 'dots') => {
                    this.plugin.settings.defaultPageStyle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Интервал автосохранения (секунды)')
            .setDesc('Как часто сохранять рисунок автоматически')
            .addSlider(slider => slider
                .setLimits(10, 300, 10)
                .setValue(this.plugin.settings.autoSaveInterval)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.autoSaveInterval = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Толщина кисти по умолчанию')
            .setDesc('Размер кисти при открытии плагина')
            .addSlider(slider => slider
                .setLimits(1, 20, 1)
                .setValue(this.plugin.settings.defaultBrushSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultBrushSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Толщина ластика по умолчанию')
            .setDesc('Размер ластика при открытии плагина')
            .addSlider(slider => slider
                .setLimits(5, 50, 5)
                .setValue(this.plugin.settings.defaultEraserSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultEraserSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Папка для сохранения PNG')
            .setDesc('Относительный путь внутри хранилища Obsidian (например Drawings или Assets/Drawings)')
            .addText(text => text
                .setPlaceholder('Drawings')
                .setValue(this.plugin.settings.saveFolder)
                .onChange(async (value) => {
                    this.plugin.settings.saveFolder = value.trim() || 'Drawings';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Папка для проектов')
            .setDesc('Куда сохранять проекты с редактируемыми страницами')
            .addText(text => text
                .setPlaceholder('DrawingProjects')
                .setValue(this.plugin.settings.projectFolder)
                .onChange(async (value) => {
                    this.plugin.settings.projectFolder = value.trim() || 'DrawingProjects';
                    await this.plugin.saveSettings();
                }));
    }
}