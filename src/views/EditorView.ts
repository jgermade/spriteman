import EditorViewComponent from './EditorView.html';
/**
 * EditorView — Main Application Controller.
 * Switches between Welcome Screen (when no project open) and Full Editor Workspace (with Tab Strip & URL Hash).
 */
import { animationService, AnimationState } from '../services/animation.service';
import { projectService, ProjectState } from '../services/project.service';
import { pwaService, PwaState } from '../services/pwa.service';
import { storageService } from '../services/storage.service';
import { tabsService, TabsState } from '../services/tabs.service';

import { CanvasStage } from '../components/CanvasStage';
import FrameStripComponent from '../components/FrameStrip.html';
import HierarchyTreeComponent from '../components/HierarchyTree.html';

import PixelPaletteComponent from '../components/PixelPalette.html';
import AnimationSettingsComponent from '../components/AnimationSettings.html';
import InspectorPanelComponent from '../components/InspectorPanel.html';
import ProjectModalComponent from '../components/ProjectModal.html';
import ProjectTabsComponent from '../components/ProjectTabs.html';
import WelcomeScreenComponent from '../components/WelcomeScreen.html';

import { STANDARD_PIXEL_SIZES, PIXEL_ART_PALETTE } from '../helpers/palette.helper';
import { formatMatrix } from '../helpers/format.helper';

export class EditorView {
  private root: HTMLElement;
  private canvasStage: CanvasStage;
  private frameStrip: any;
  private hierarchyTree: any;
  private pixelPalette: any;
  private animationSettings: any;
  private inspectorPanel: any;
  private projectModal: any;
  private projectTabs: any;
  private welcomeScreen: any;
  private component: any;

  private currentZoom = 6;
  private activeProjectName = '';
  private isTempSwapped = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'app-container';

    // 1. Initialize isolated components
    this.canvasStage = new CanvasStage({
      canvasWidth: 64,
      canvasHeight: 64,
      zoom: this.currentZoom,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      onPaintStroke: (pixels, color) => {
        const currentInt = Math.round(animationService.getState().currentFrame);
        const group = projectService.getActiveLayerGroupForFrame(currentInt);
        if (group && currentInt > group.start_frame && currentInt < group.end_frame) {
          // Intermediate frames in group are auto-interpolated, non-editable
          return;
        }
        if (color === '__eraser__') {
          projectService.erasePixels(currentInt, pixels);
        } else {
          projectService.setPixels(currentInt, pixels, color);
        }
        this.saveCurrentProject();
      },
      onSetPivot: (x, y) => {
        const proj = projectService.getState();
        const selectedId = proj.selectedLayerId;
        const currentInt = Math.round(animationService.getState().currentFrame);
        if (selectedId) {
          const group = projectService.getActiveLayerGroupForFrame(currentInt);
          if (group) {
            projectService.setGroupPivot(selectedId, group.id, x, y);
            this.canvasStage.setPivot({ x, y });
          } else {
            projectService.setLayerPivot(selectedId, x, y);
            this.canvasStage.setPivot({ x, y });
          }
          this.canvasStage.setPivotMode(false);
          this.saveCurrentProject();
        }
      },
      onTranslateLayer: (deltaX, deltaY) => {
        const proj = projectService.getState();
        const selectedId = proj.selectedLayerId;
        const currentInt = Math.round(animationService.getState().currentFrame);
        if (selectedId) {
          projectService.translateLayer(selectedId, deltaX, deltaY, currentInt);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
    });

    this.pixelPalette = PixelPaletteComponent;
    this.animationSettings = AnimationSettingsComponent;
    this.hierarchyTree = HierarchyTreeComponent;
    this.frameStrip = FrameStripComponent;
    this.inspectorPanel = InspectorPanelComponent;
    this.projectTabs = ProjectTabsComponent;
    this.projectModal = ProjectModalComponent;
    this.welcomeScreen = WelcomeScreenComponent;

    this.buildLayout();
    this.bindServices();
    this.initKeyboardShortcuts();
    this.initAppFlow();
  }

  public getElement(): HTMLElement {
    return this.root;
  }

  private buildLayout(): void {
    this.component = EditorViewComponent;
    this.component.mount(this.root, {
      hasActiveProject: false,
      canvasWidth: 64,
      canvasHeight: 64,
      fps: 12,
      isInstallable: pwaService.getState().isInstallable,
      saveButtonText: "💾 Save",
      onSave: () => this.saveCurrentProject(),
      onInstall: () => pwaService.promptInstall(),
    });

    this.projectTabs.mount(this.root.querySelector(".tabs-wrapper"), {
      tabs: [],
      activeTab: null,
      onSelectTab: (tabId: string) => tabsService.selectTab(tabId),
      onCloseTab: (tabId: string) => tabsService.closeTab(tabId),
      onNewTab: async () => {
        const files = await storageService.listFiles();
        if (this.projectModal.data) {
          this.projectModal.data.savedFiles = files;
          this.projectModal.data.currentTab = "new";
          this.projectModal.data.isOpen = true;
        }
      },
    });

    this.welcomeScreen.mount(this.root.querySelector(".welcome-screen-wrapper"), {
      savedFiles: [],
      sizes: STANDARD_PIXEL_SIZES,
      onCreateProject: (name: string, w: number, h: number, fps: number) => this.handleCreateProject(name, w, h, fps),
      onOpenProject: (filename: string) => this.handleOpenProject(filename),
      onOpenSample: () => this.handleOpenSample(),
      onImportJson: (json: string) => this.handleImportJson(json),
    });

    this.root.querySelector(".canvas-stage-wrapper")?.appendChild(this.canvasStage.getElement());

    this.hierarchyTree.mount(this.root.querySelector(".hierarchy-wrapper"), {
      layers: [],
      selectedLayerId: null,
      isPivotMode: false,
      onSelectLayer: (layerId: string) => {
        projectService.selectLayer(layerId);
        const currentInt = Math.round(animationService.getState().currentFrame);
        const layer = projectService.getState().layers.find((l) => l.id === layerId);
        const group = projectService.getActiveLayerGroupForFrame(currentInt);
        const pivot = group?.pivot ?? layer?.pivot ?? layer?.default_transform?.pivot ?? null;
        this.canvasStage.setPivot(pivot);
      },
      onAddLayer: () => {
        projectService.addLayer();
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onToggleLayerRelative: (layerId: string) => {
        projectService.toggleLayerRelative(layerId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onToggleLayerVisibility: (layerId: string) => {
        projectService.toggleLayerVisibility(layerId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onRenameLayer: (layerId: string, name: string) => {
        projectService.renameLayer(layerId, name);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onDeleteLayer: (layerId: string) => {
        if (projectService.deleteLayer(layerId)) {
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onTogglePivotMode: () => {
        const next = !this.canvasStage.isPivotMode();
        this.canvasStage.setPivotMode(next);
        if (this.hierarchyTree.data) this.hierarchyTree.data.isPivotMode = next;
        if (this.frameStrip.data) this.frameStrip.data.isPivotMode = next;
      },
      onReorderLayer: (layerId: string, targetIndex: number, newParentId: string | null) => {
        projectService.reorderLayer(layerId, targetIndex, newParentId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
    });

    this.frameStrip.mount(this.root.querySelector(".framestrip-wrapper"), {
      totalFrames: 1,
      currentFrame: 0,
      isPlaying: false,
      onionSkin: true,
      spriteWidth: 64,
      spriteHeight: 64,
      framePixels: {},
      animations: [],
      activeAnimationId: '',
      layerGroups: [],
      activeGroup: null,
      isPivotMode: false,
      canUndo: false,
      canRedo: false,
      onTogglePlay: () => animationService.togglePlay(),
      onSelectFrame: (idx: number) => {
        animationService.pause();
        animationService.seek(idx);
      },
      onSelectRange: (start: number, end: number) => {
        // Range selection handled inside FrameStrip
      },
      onStep: (delta: number) => animationService.step(delta),
      onAddFrame: (targetIndex?: number) => {
        const newIdx = typeof targetIndex === 'number'
          ? projectService.insertFrame(targetIndex, true)
          : projectService.addFrame(true);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(newIdx);
        this.saveCurrentProject();
      },
      onReorderFrame: (from: number, to: number) => {
        projectService.reorderFrame(from, to);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(to);
        this.saveCurrentProject();
      },
      onDuplicateFrame: () => {
        const currentInt = Math.round(animationService.getState().currentFrame);
        const newIdx = projectService.duplicateFrame(currentInt);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(newIdx);
        this.saveCurrentProject();
      },
      onDeleteFrame: () => {
        const currentInt = Math.round(animationService.getState().currentFrame);
        projectService.deleteFrame(currentInt);
        animationService.reloadProject(projectService.getRawJson());
        const nextInt = Math.max(0, currentInt - 1);
        animationService.seek(nextInt);
        this.saveCurrentProject();
      },
      onToggleOnionSkin: (enabled: boolean) => animationService.setOnionSkinEnabled(enabled),
      onGroupFrames: (start: number, end: number) => {
        const selectedId = projectService.getState().selectedLayerId;
        if (selectedId) {
          projectService.createFrameGroup(selectedId, start, end);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onUngroupFrames: (groupId: string) => {
        const selectedId = projectService.getState().selectedLayerId;
        if (selectedId) {
          projectService.deleteFrameGroup(selectedId, groupId);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onToggleGroupPivotMode: () => {
        const next = !this.canvasStage.isPivotMode();
        this.canvasStage.setPivotMode(next);
        if (this.frameStrip.data) this.frameStrip.data.isPivotMode = next;
        if (this.hierarchyTree.data) this.hierarchyTree.data.isPivotMode = next;
      },
      onSelectAnimation: (animId: string) => {
        projectService.selectAnimation(animId);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(0);
        this.saveCurrentProject();
      },
      onAddAnimation: () => {
        const name = prompt('Nombre de la nueva animación (ej. walk, attack, jump):', 'walk');
        if (name !== null) {
          projectService.addAnimation(name.trim() || undefined);
          animationService.reloadProject(projectService.getRawJson());
          animationService.seek(0);
          this.saveCurrentProject();
        }
      },
      onRenameAnimation: (animId: string, name: string) => {
        projectService.renameAnimation(animId, name);
        this.saveCurrentProject();
      },
      onDeleteAnimation: (animId: string) => {
        projectService.deleteAnimation(animId);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(0);
        this.saveCurrentProject();
      },
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
    });

    this.inspectorPanel.mount(this.root.querySelector(".inspector-wrapper"), {
      item: null,
      matrixText: "",
    });

    this.pixelPalette.mount(this.root.querySelector(".palette-wrapper"), {
      primaryColor: "#000000",
      secondaryColor: "#ffffff",
      isTempSwapped: false,
      palette: PIXEL_ART_PALETTE,
      onSelectPrimary: (color: string) => {
        if (this.pixelPalette.data) {
          this.pixelPalette.data.primaryColor = color;
        }
        this.canvasStage.setPrimaryColor(color);
      },
      onSelectSecondary: (color: string) => {
        if (this.pixelPalette.data) {
          this.pixelPalette.data.secondaryColor = color;
        }
        this.canvasStage.setSecondaryColor(color);
      },
      onSelectColors: (primary: string, secondary: string) => {
        if (this.pixelPalette.data) {
          this.pixelPalette.data.primaryColor = primary;
          this.pixelPalette.data.secondaryColor = secondary;
        }
        this.canvasStage.setColors(primary, secondary);
      },
      onSwapColors: () => {
        this.swapPaletteColors();
      },
    });

    this.animationSettings.mount(this.root.querySelector(".settings-wrapper"), {
      width: 64,
      height: 64,
      fps: 12,
      zoom: this.currentZoom,
      sizes: STANDARD_PIXEL_SIZES,
      onChangeCanvasSize: (w: number, h: number) => {
        projectService.setCanvasSize(w, h);
        this.canvasStage.setCanvasSize(w, h);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onChangeFps: (fps: number) => {
        projectService.setFps(fps);
        animationService.setFps(fps);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onChangeZoom: (zoom: number) => {
        this.currentZoom = zoom;
        this.canvasStage.setZoom(zoom);
      },
    });

    this.projectModal.mount(this.root.querySelector(".modal-wrapper"), {
      isOpen: false,
      currentTab: "new",
      savedFiles: [],
      sizes: STANDARD_PIXEL_SIZES,
      onCreate: (name: string, w: number, h: number, fps: number) => {
        this.handleCreateProject(name, w, h, fps);
        if (this.projectModal.data) this.projectModal.data.isOpen = false;
      },
      onOpen: (filename: string) => {
        this.handleOpenProject(filename);
        if (this.projectModal.data) this.projectModal.data.isOpen = false;
      },
      onLoadSample: () => {
        this.handleOpenSample();
        if (this.projectModal.data) this.projectModal.data.isOpen = false;
      },
      onImportJson: (json: string) => {
        this.handleImportJson(json);
        if (this.projectModal.data) this.projectModal.data.isOpen = false;
      },
      onClose: () => {
        if (this.projectModal.data) this.projectModal.data.isOpen = false;
      },
    });
  }

  private handleUndo(): void {
    if (projectService.undo()) {
      const raw = projectService.getRawJson();
      animationService.reloadProject(raw);
      const totalFrames = projectService.getState().meta.total_frames;
      const curF = Math.min(Math.round(animationService.getState().currentFrame), Math.max(0, totalFrames - 1));
      animationService.seek(curF);
      this.saveCurrentProject();
    }
  }

  private handleRedo(): void {
    if (projectService.redo()) {
      const raw = projectService.getRawJson();
      animationService.reloadProject(raw);
      const totalFrames = projectService.getState().meta.total_frames;
      const curF = Math.min(Math.round(animationService.getState().currentFrame), Math.max(0, totalFrames - 1));
      animationService.seek(curF);
      this.saveCurrentProject();
    }
  }

  private swapPaletteColors(): void {
    if (!this.pixelPalette.data) return;
    const temp = this.pixelPalette.data.primaryColor;
    this.pixelPalette.data.primaryColor = this.pixelPalette.data.secondaryColor;
    this.pixelPalette.data.secondaryColor = temp;
    this.canvasStage.setColors(this.pixelPalette.data.primaryColor, this.pixelPalette.data.secondaryColor);
  }

  private initKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Don't intercept when user is typing in inputs or textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.classList.contains('layer-rename-input'))
      ) {
        return;
      }

      // Check if project is open
      const hasProject = tabsService.getState().tabs.length > 0 && !!tabsService.getState().activeTab;
      if (!hasProject) return;

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Undo / Redo: Cmd+Z, Cmd+Shift+Z, Cmd+Y
      if (isCmdOrCtrl) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.handleRedo();
          } else {
            this.handleUndo();
          }
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          this.handleRedo();
          return;
        }
      }

      // Add frame hotkey: '+' or '=' (with or without shift, or numpad +)
      if ((e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') && !isCmdOrCtrl && !e.altKey) {
        e.preventDefault();
        const newIdx = projectService.addFrame(true);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(newIdx);
        this.saveCurrentProject();
        return;
      }

      // Palette color swap shortcuts: X or temporary swap with Cmd/Alt
      if (e.key === 'x' || e.key === 'X') {
        this.swapPaletteColors();
        return;
      }

      if ((e.key === 'Meta' || e.key === 'Alt') && !this.isTempSwapped) {
        this.isTempSwapped = true;
        this.swapPaletteColors();
        if (this.pixelPalette.data) this.pixelPalette.data.isTempSwapped = true;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (this.isTempSwapped && (e.key === 'Meta' || e.key === 'Alt') && !e.metaKey && !e.altKey) {
        this.isTempSwapped = false;
        this.swapPaletteColors();
        if (this.pixelPalette.data) this.pixelPalette.data.isTempSwapped = false;
      }
    });

    window.addEventListener('blur', () => {
      if (this.isTempSwapped) {
        this.isTempSwapped = false;
        this.swapPaletteColors();
        if (this.pixelPalette.data) this.pixelPalette.data.isTempSwapped = false;
      }
    });
  }

  private async initAppFlow(): Promise<void> {
    // 1. Ensure sample project is stored in WASMFS if first time
    const files = await storageService.listFiles();
    if (files.length === 0) {
      try {
        const sampleText = await fetch('./examples/sample_walk.json').then((r) => r.text());
        await storageService.saveFile('sample_walk', sampleText);
      } catch {}
    }

    // Refresh file list in welcome and modal
    const updatedFiles = await storageService.listFiles();
    if (this.welcomeScreen.data) this.welcomeScreen.data.savedFiles = updatedFiles;
    if (this.projectModal.data) this.projectModal.data.savedFiles = updatedFiles;

    // 2. Read tabs from URL hash: #tabs=<id1>,#<active>,<id2>
    const initialTabsState = tabsService.getState();
    this.applyTabsState(initialTabsState);
  }

  private async applyTabsState(state: TabsState): Promise<void> {
    if (this.projectTabs.data) {
      this.projectTabs.data.tabs = state.tabs;
      this.projectTabs.data.activeTab = state.activeTab;
    }

    const hasProject = state.tabs.length > 0 && !!state.activeTab;
    const projState = projectService.getState();

    if (this.component?.data) {
      this.component.data.hasActiveProject = hasProject;
      this.component.data.canvasWidth = projState.meta.canvas_width;
      this.component.data.canvasHeight = projState.meta.canvas_height;
      this.component.data.fps = projState.meta.fps;
    }

    if (!hasProject) {
      animationService.pause();
      const files = await storageService.listFiles();
      if (this.welcomeScreen.data) this.welcomeScreen.data.savedFiles = files;
      return;
    }

    // Load active tab content from WASMFS
    await this.loadActiveProject(state.activeTab);
  }

  private async loadActiveProject(projectName: string): Promise<void> {
    this.activeProjectName = projectName;
    let json = await storageService.readFile(projectName);

    if (!json) {
      if (projectName === 'sample_walk') {
        json = await fetch('./examples/sample_walk.json').then((r) => r.text());
        await storageService.saveFile(projectName, json);
      } else {
        // Create fallback project with 1 frame
        json = projectService.createNewProject(projectName, 64, 64, 128);
        await storageService.saveFile(projectName, json);
      }
    }

    projectService.setProjectJson(json);
    await animationService.reloadProject(json);
    animationService.seek(0);
  }

  private async handleCreateProject(name: string, w: number, h: number, fps: number): Promise<void> {
    const slug = name.trim().replace(/\s+/g, '_') || 'sprite_character';
    const json = projectService.createNewProject(slug, w, h, fps);
    await storageService.saveFile(slug, json);

    // Open tab (adds tab, marks active, updates URL hash, displays editor)
    tabsService.openTab(slug);
  }

  private async handleOpenProject(filename: string): Promise<void> {
    const slug = filename.replace('.json', '');
    tabsService.openTab(slug);
  }

  private async handleOpenSample(): Promise<void> {
    tabsService.openTab('sample_walk');
  }

  private async handleImportJson(json: string): Promise<void> {
    let name = 'imported_sprite';
    try {
      const parsed = JSON.parse(json);
      if (parsed.meta?.name) name = parsed.meta.name.replace(/\s+/g, '_');
    } catch {}

    await storageService.saveFile(name, json);
    tabsService.openTab(name);
  }

  private async saveCurrentProject(): Promise<void> {
    if (!this.activeProjectName) return;
    const json = projectService.getRawJson();
    await storageService.saveFile(this.activeProjectName, json);

    if (this.component?.data) {
      this.component.data.saveButtonText = '✓ Saved!';
      setTimeout(() => {
        if (this.component?.data) {
          this.component.data.saveButtonText = '💾 Save';
        }
      }, 1200);
    }
  }

  private bindServices(): void {
    // 1. Tabs service synchronization
    tabsService.subscribe((state: TabsState) => {
      this.applyTabsState(state);
    });

    // 2. Animation service updates
    animationService.subscribe((animState: AnimationState) => {
      const proj = projectService.getState();
      const currentInt = Math.round(animState.currentFrame);
      const activeLayer = proj.layers.find((l) => l.id === proj.selectedLayerId);
      const layerGroups = activeLayer?.groups || [];
      const activeGroup = projectService.getActiveLayerGroupForFrame(currentInt);
      const isPivot = this.canvasStage.isPivotMode();

      const isLayerVisible = activeLayer ? activeLayer.visible !== false : true;

      if (this.frameStrip.data) {
        this.frameStrip.data.currentFrame = animState.currentFrame;
        this.frameStrip.data.totalFrames = animState.totalFrames;
        this.frameStrip.data.isPlaying = animState.isPlaying;
        this.frameStrip.data.framePixels = proj.frame_pixels;
        this.frameStrip.data.spriteWidth = proj.meta.canvas_width;
        this.frameStrip.data.spriteHeight = proj.meta.canvas_height;
        this.frameStrip.data.animations = proj.animations;
        this.frameStrip.data.activeAnimationId = proj.activeAnimationId;
        this.frameStrip.data.layerGroups = layerGroups;
        this.frameStrip.data.activeGroup = activeGroup;
        this.frameStrip.data.isPivotMode = isPivot;
        this.frameStrip.data.canUndo = projectService.canUndo();
        this.frameStrip.data.canRedo = projectService.canRedo();
      }

      const currentPixels = isLayerVisible ? projectService.getFramePixels(currentInt) : {};
      const prevInt = Math.max(0, currentInt - 1);
      const onionPixels = animState.onionSkinEnabled && currentInt > 0 && isLayerVisible ? projectService.getFramePixels(prevInt) : null;
      this.canvasStage.setFramePixels(currentPixels, onionPixels);

      const pivot = activeGroup?.pivot ?? activeLayer?.pivot ?? activeLayer?.default_transform?.pivot ?? null;
      this.canvasStage.setPivot(pivot);

      if (animState.resolvedFrame) {
        const selectedId = proj.selectedLayerId;
        const onionItems = animState.onionSkinFrame?.items ?? null;
        this.canvasStage.render(animState.resolvedFrame.items, selectedId, onionItems);

        const selectedItem = animState.resolvedFrame.items.find((i) => i.layer_id === selectedId);
        if (this.inspectorPanel.data) {
          this.inspectorPanel.data.item = selectedItem || null;
          this.inspectorPanel.data.matrixText = selectedItem?.matrix ? formatMatrix(selectedItem.matrix) : '';
        }
      }
    });

    // 3. Project service updates
    projectService.subscribe((projState: ProjectState) => {
      const isPivot = this.canvasStage.isPivotMode();
      if (this.hierarchyTree.data) {
        this.hierarchyTree.data.layers = projState.layers;
        this.hierarchyTree.data.selectedLayerId = projState.selectedLayerId;
        this.hierarchyTree.data.isPivotMode = isPivot;
      }

      const anim = animationService.getState();
      const currentInt = Math.round(anim.currentFrame);
      const activeLayer = (projState.layers || []).find((l) => l && l.id === projState.selectedLayerId);
      const isLayerVisible = activeLayer ? activeLayer.visible !== false : true;
      const layerGroups = activeLayer?.groups || [];
      const activeGroup = projectService.getActiveLayerGroupForFrame(currentInt);
      const pivot = activeGroup?.pivot ?? activeLayer?.pivot ?? activeLayer?.default_transform?.pivot ?? null;
      this.canvasStage.setPivot(pivot);

      if (this.component?.data) {
        this.component.data.canvasWidth = projState.meta.canvas_width;
        this.component.data.canvasHeight = projState.meta.canvas_height;
        this.component.data.fps = projState.meta.fps;
      }

      this.canvasStage.setCanvasSize(projState.meta.canvas_width, projState.meta.canvas_height);
      if (this.animationSettings.data) {
        this.animationSettings.data.width = projState.meta.canvas_width;
        this.animationSettings.data.height = projState.meta.canvas_height;
        this.animationSettings.data.fps = projState.meta.fps;
        this.animationSettings.data.zoom = this.currentZoom;
      }

      const currentPixels = isLayerVisible ? (projState.frame_pixels[currentInt] || {}) : {};
      const prevInt = Math.max(0, currentInt - 1);
      const onionPixels = anim.onionSkinEnabled && currentInt > 0 && isLayerVisible ? (projState.frame_pixels[prevInt] || {}) : null;
      this.canvasStage.setFramePixels(currentPixels, onionPixels);

      if (this.frameStrip.data) {
        this.frameStrip.data.currentFrame = anim.currentFrame;
        this.frameStrip.data.totalFrames = projState.meta.total_frames;
        this.frameStrip.data.isPlaying = anim.isPlaying;
        this.frameStrip.data.framePixels = projState.frame_pixels;
        this.frameStrip.data.spriteWidth = projState.meta.canvas_width;
        this.frameStrip.data.spriteHeight = projState.meta.canvas_height;
        this.frameStrip.data.animations = projState.animations;
        this.frameStrip.data.activeAnimationId = projState.activeAnimationId;
        this.frameStrip.data.layerGroups = layerGroups;
        this.frameStrip.data.activeGroup = activeGroup;
        this.frameStrip.data.isPivotMode = isPivot;
        this.frameStrip.data.canUndo = projectService.canUndo();
        this.frameStrip.data.canRedo = projectService.canRedo();
      }

      if (anim.resolvedFrame) {
        const selectedItem = anim.resolvedFrame.items.find((i) => i.layer_id === projState.selectedLayerId);
        if (this.inspectorPanel.data) {
          this.inspectorPanel.data.item = selectedItem || null;
          this.inspectorPanel.data.matrixText = selectedItem?.matrix ? formatMatrix(selectedItem.matrix) : '';
        }
        this.canvasStage.render(anim.resolvedFrame.items, projState.selectedLayerId, anim.onionSkinFrame?.items);
      }
    });

    // 4. PWA state updates
    pwaService.subscribe((pwa: PwaState) => {
      if (this.component?.data) {
        this.component.data.isInstallable = pwa.isInstallable;
      }
    });
  }
}
