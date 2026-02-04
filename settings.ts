import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface DrawingPluginSettings {
    defaultPageStyle: 'blank' | 'grid' | 'dots';
    defaultBrushColor: string;
    defaultBrushSize: number;
    autoSave: boolean;
    gridSize: number;
    dotSpacing: number;
    pdfExportSettings: {
        fileNameTemplate: string;
        includeDate: boolean;
        quality: 'low' | 'medium' | 'high';
    };
}

export const DEFAULT_SETTINGS: DrawingPluginSettings = {
    defaultPageStyle: 'grid',
    defaultBrushColor: '#000000',
    defaultBrushSize: 2,
    autoSave: true,
    gridSize: 20,
    dotSpacing: 20,
    pdfExportSettings: {
        fileNameTemplate: 'Drawing-{{date}}',
        includeDate: true,
        quality: 'medium'
    }
};

export class DrawingSettingTab extends PluginSettingTab {
    plugin: Plugin & { settings: DrawingPluginSettings; saveSettings: () => Promise<void> };

    constructor(app: App, plugin: Plugin & { settings: DrawingPluginSettings; saveSettings: () => Promise<void> }) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Настройки плагина для рисования' });

        // Стиль страницы по умолчанию
        new Setting(containerEl)
            .setName('Стиль страницы по умолчанию')
            .setDesc('Какой фон использовать для новых страниц')
            .addDropdown(dropdown => dropdown
                .addOption('blank', 'Чистая')
                .addOption('grid', 'Клетка')
                .addOption('dots', 'Точки')
                .setValue(this.plugin.settings.defaultPageStyle)
                .onChange(async (value: 'blank' | 'grid' | 'dots') => {
                    this.plugin.settings.defaultPageStyle = value;
                    await this.plugin.saveSettings();
                }));

        // Цвет кисти по умолчанию
        new Setting(containerEl)
            .setName('Цвет кисти по умолчанию')
            .setDesc('Цвет, который будет выбран при открытии плагина')
            .addColorPicker(colorPicker => colorPicker
                .setValue(this.plugin.settings.defaultBrushColor)
                .onChange(async (value) => {
                    this.plugin.settings.defaultBrushColor = value;
                    await this.plugin.saveSettings();
                }));

        // Размер сетки
        new Setting(containerEl)
            .setName('Размер клетки/точек')
            .setDesc('Расстояние между линиями сетки или точками (в пикселях)')
            .addSlider(slider => slider
                .setLimits(10, 50, 5)
                .setValue(this.plugin.settings.gridSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.gridSize = value;
                    this.plugin.settings.dotSpacing = value;
                    await this.plugin.saveSettings();
                }));

        // Настройки экспорта PDF
        containerEl.createEl('h3', { text: 'Настройки экспорта в PDF' });

        new Setting(containerEl)
            .setName('Шаблон имени файла')
            .setDesc('{{date}} будет заменен на текущую дату')
            .addText(text => text
                .setPlaceholder('Drawing-{{date}}')
                .setValue(this.plugin.settings.pdfExportSettings.fileNameTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.pdfExportSettings.fileNameTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Качество экспорта')
            .setDesc('Высокое качество увеличивает размер файла')
            .addDropdown(dropdown => dropdown
                .addOption('low', 'Низкое (быстро)')
                .addOption('medium', 'Среднее')
                .addOption('high', 'Высокое')
                .setValue(this.plugin.settings.pdfExportSettings.quality)
                .onChange(async (value: 'low' | 'medium' | 'high') => {
                    this.plugin.settings.pdfExportSettings.quality = value;
                    await this.plugin.saveSettings();
                }));

        // Раздел горячих клавиш
        containerEl.createEl('h3', { text: 'Горячие клавиши' });
        containerEl.createEl('p', {
            text: 'Для настройки горячих клавиш перейдите в раздел "Горячие клавиши" настроек Obsidian и найдите "Drawing Canvas"'
        });
    }
}