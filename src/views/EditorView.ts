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
import { FrameStrip } from '../components/FrameStrip';
import { PixelPalette } from '../components/PixelPalette';
import { AnimationSettings } from '../components/AnimationSettings';
import { HierarchyTree } from '../components/HierarchyTree';
import { InspectorPanel } from '../components/InspectorPanel';
import { ProjectModal } from '../components/ProjectModal';
import { ProjectTabs } from '../components/ProjectTabs';
import { WelcomeScreen } from '../components/WelcomeScreen';

export class EditorView {
  private root: HTMLElement;
  private canvasStage: CanvasStage;
  private frameStrip: FrameStrip;
  private pixelPalette: PixelPalette;
  private animationSettings: AnimationSettings;
  private hierarchyTree: HierarchyTree;
  private inspectorPanel: InspectorPanel;
  private projectModal: ProjectModal;
  private projectTabs: ProjectTabs;
  private welcomeScreen: WelcomeScreen;

  private currentZoom = 6;
  private activeProjectName = '';

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

    this.frameStrip = new FrameStrip({
      totalFrames: 1,
      currentFrame: 0,
      isPlaying: false,
      onionSkin: true,
      onTogglePlay: () => animationService.togglePlay(),
      onSelectFrame: (idx) => {
        animationService.pause();
        animationService.seek(idx);
      },
      onStep: (delta) => animationService.step(delta),
      onAddFrame: (targetIndex?: number) => {
        const newIdx = typeof targetIndex === 'number'
          ? projectService.insertFrame(targetIndex, true)
          : projectService.addFrame(true);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(newIdx);
        this.saveCurrentProject();
      },
      onReorderFrame: (from, to) => {
        projectService.reorderFrame(from, to);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(to);
        this.saveCurrentProject();
      },
      onInterpolateFrames: (startFrame, endFrame) => {
        projectService.interpolateMotion(startFrame, endFrame);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(startFrame);
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
      onToggleOnionSkin: (enabled) => animationService.setOnionSkinEnabled(enabled),

      // Layer Frame Grouping
      onGroupFrames: (start, end) => {
        const selectedId = projectService.getState().selectedLayerId;
        if (selectedId) {
          projectService.createFrameGroup(selectedId, start, end);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onUngroupFrames: (groupId) => {
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
        const proj = projectService.getState();
        const currentInt = Math.round(animationService.getState().currentFrame);
        const activeLayer = proj.layers.find((l) => l.id === proj.selectedLayerId);
        const layerGroups = activeLayer?.groups || [];
        const activeGroup = projectService.getActiveLayerGroupForFrame(currentInt);
        this.frameStrip.update(
          currentInt,
          proj.meta.total_frames,
          animationService.getState().isPlaying,
          proj.frame_pixels,
          proj.meta.canvas_width,
          proj.meta.canvas_height,
          proj.animations,
          proj.activeAnimationId,
          layerGroups,
          activeGroup,
          next
        );
      },
      onInterpolateGroup: (groupId) => {
        const selectedId = projectService.getState().selectedLayerId;
        if (selectedId) {
          projectService.interpolateGroupMotion(selectedId, groupId);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },

      // Multi-Animation Clips
      onSelectAnimation: (animId) => {
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
      onRenameAnimation: (animId, name) => {
        projectService.renameAnimation(animId, name);
        this.saveCurrentProject();
      },
      onDeleteAnimation: (animId) => {
        projectService.deleteAnimation(animId);
        animationService.reloadProject(projectService.getRawJson());
        animationService.seek(0);
        this.saveCurrentProject();
      },
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
    });

    this.pixelPalette = new PixelPalette({
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      onSelectPrimary: (color) => {
        this.canvasStage.setPrimaryColor(color);
        const selectedId = projectService.getState().selectedLayerId;
        if (selectedId) {
          projectService.setLayerColor(selectedId, color);
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onSelectSecondary: (color) => {
        this.canvasStage.setSecondaryColor(color);
      },
      onSelectColors: (primary, secondary) => {
        this.canvasStage.setColors(primary, secondary);
      },
    });

    this.animationSettings = new AnimationSettings({
      currentWidth: 64,
      currentHeight: 64,
      currentFps: 12,
      currentZoom: this.currentZoom,
      onChangeCanvasSize: (w, h) => {
        projectService.setCanvasSize(w, h);
        this.canvasStage.setCanvasSize(w, h);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onChangeFps: (fps) => {
        projectService.setFps(fps);
        animationService.setFps(fps);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onChangeZoom: (zoom) => {
        this.currentZoom = zoom;
        this.canvasStage.setZoom(zoom);
      },
    });

    this.hierarchyTree = new HierarchyTree({
      onSelectLayer: (layerId) => {
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
      onToggleLayerRelative: (layerId) => {
        projectService.toggleLayerRelative(layerId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onToggleLayerVisibility: (layerId) => {
        projectService.toggleLayerVisibility(layerId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onRenameLayer: (layerId, name) => {
        projectService.renameLayer(layerId, name);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
      onDeleteLayer: (layerId) => {
        if (projectService.deleteLayer(layerId)) {
          animationService.reloadProject(projectService.getRawJson());
          this.saveCurrentProject();
        }
      },
      onTogglePivotMode: () => {
        const next = !this.canvasStage.isPivotMode();
        this.canvasStage.setPivotMode(next);
        const proj = projectService.getState();
        this.hierarchyTree.update(proj.layers, proj.selectedLayerId, next);
      },
      onReorderLayer: (layerId, targetIndex, newParentId) => {
        projectService.reorderLayer(layerId, targetIndex, newParentId);
        animationService.reloadProject(projectService.getRawJson());
        this.saveCurrentProject();
      },
    });

    this.inspectorPanel = new InspectorPanel();

    this.projectTabs = new ProjectTabs({
      onSelectTab: (tabId) => tabsService.selectTab(tabId),
      onCloseTab: (tabId) => tabsService.closeTab(tabId),
      onNewTab: async () => {
        const files = await storageService.listFiles();
        this.projectModal.setFiles(files);
        this.projectModal.show('new');
      },
    });

    this.projectModal = new ProjectModal({
      onCreate: (name, w, h, fps) => this.handleCreateProject(name, w, h, fps),
      onOpen: (filename) => this.handleOpenProject(filename),
      onLoadSample: () => this.handleOpenSample(),
      onImportJson: (json) => this.handleImportJson(json),
    });

    this.welcomeScreen = new WelcomeScreen({
      onCreateProject: (name, w, h, fps) => this.handleCreateProject(name, w, h, fps),
      onOpenProject: (filename) => this.handleOpenProject(filename),
      onOpenSample: () => this.handleOpenSample(),
      onImportJson: (json) => this.handleImportJson(json),
    });

    this.buildLayout();
    this.bindServices();
    this.initKeyboardShortcuts();
    this.initAppFlow();
  }

  public getElement(): HTMLElement {
    return this.root;
  }

  private buildLayout(): void {
    this.root.innerHTML = `
      <!-- Top Application Bar -->
      <div class="app-topbar">
        <div class="topbar-left">
          <div class="app-logo">
            <img src="./icon-192.svg" class="logo-pixel-img" width="22" height="22" alt="Logo" />
            <span class="logo-text">Spritemotion</span>
          </div>

          <!-- Project Tabs Strip -->
          <div class="tabs-wrapper"></div>
        </div>

        <div class="topbar-center">
          <span id="topbar-size-badge" class="badge-tag" style="display: none;">64 × 64 px</span>
          <span id="topbar-fps-badge" class="badge-tag" style="display: none;">12 FPS</span>
        </div>

        <div class="topbar-right">
          <button id="btn-topbar-undo" class="topbar-btn" title="Deshacer (Cmd+Z)" style="display: none;">↶ Deshacer</button>
          <button id="btn-topbar-redo" class="topbar-btn" title="Rehacer (Cmd+Shift+Z)" style="display: none;">↷ Rehacer</button>
          <button id="btn-menu-save" class="topbar-btn primary" title="Save Project to WASMFS" style="display: none;">💾 Save</button>
          <button id="pwa-install-btn" class="pwa-install-btn" style="display: none;">⬇ Install App</button>
        </div>
      </div>

      <!-- Welcome Screen (Shown when no project is open) -->
      <div class="welcome-screen-wrapper"></div>

      <!-- Main Docked Editor Workspace (Hidden when no project is open) -->
      <div class="app-workspace" style="display: none;">
        <!-- Center Canvas & Bottom Timeline -->
        <div class="center-workspace">
          <div class="canvas-viewport-panel">
            <div class="canvas-stage-wrapper"></div>
          </div>
          <div class="timeline-docked-panel">
            <div class="framestrip-wrapper"></div>
          </div>
        </div>

        <!-- Right Side Tools Sidebar -->
        <div class="sidebar-docked-panel">
          <div class="sidebar-scrollable">
            <div class="hierarchy-wrapper"></div>
            <div class="inspector-wrapper"></div>
            <div class="palette-wrapper"></div>
            <div class="settings-wrapper"></div>
          </div>
        </div>
      </div>

      <!-- Modal Container -->
      <div class="modal-wrapper"></div>
    `;

    // Append component elements
    this.root.querySelector('.tabs-wrapper')!.appendChild(this.projectTabs.getElement());
    this.root.querySelector('.welcome-screen-wrapper')!.appendChild(this.welcomeScreen.getElement());
    this.root.querySelector('.canvas-stage-wrapper')!.appendChild(this.canvasStage.getElement());
    this.root.querySelector('.framestrip-wrapper')!.appendChild(this.frameStrip.getElement());
    this.root.querySelector('.hierarchy-wrapper')!.appendChild(this.hierarchyTree.getElement());
    this.root.querySelector('.inspector-wrapper')!.appendChild(this.inspectorPanel.getElement());
    this.root.querySelector('.palette-wrapper')!.appendChild(this.pixelPalette.getElement());
    this.root.querySelector('.settings-wrapper')!.appendChild(this.animationSettings.getElement());
    this.root.querySelector('.modal-wrapper')!.appendChild(this.projectModal.getElement());

    // Topbar undo / redo actions
    this.root.querySelector('#btn-topbar-undo')?.addEventListener('click', () => {
      this.handleUndo();
    });
    this.root.querySelector('#btn-topbar-redo')?.addEventListener('click', () => {
      this.handleRedo();
    });

    // Topbar save action
    this.root.querySelector('#btn-menu-save')?.addEventListener('click', () => {
      this.saveCurrentProject();
    });

    // PWA install button
    this.root.querySelector('#pwa-install-btn')?.addEventListener('click', () => {
      pwaService.promptInstall();
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
    this.welcomeScreen.setFiles(updatedFiles);
    this.projectModal.setFiles(updatedFiles);

    // 2. Read tabs from URL hash: #tabs=<id1>,#<active>,<id2>
    const initialTabsState = tabsService.getState();
    this.applyTabsState(initialTabsState);
  }

  private async applyTabsState(state: TabsState): Promise<void> {
    this.projectTabs.update(state.tabs, state.activeTab);

    const workspace = this.root.querySelector('.app-workspace') as HTMLElement;
    const welcomeWrapper = this.root.querySelector('.welcome-screen-wrapper') as HTMLElement;
    const saveBtn = this.root.querySelector('#btn-menu-save') as HTMLElement;
    const undoBtn = this.root.querySelector('#btn-topbar-undo') as HTMLElement;
    const redoBtn = this.root.querySelector('#btn-topbar-redo') as HTMLElement;
    const sizeBadge = this.root.querySelector('#topbar-size-badge') as HTMLElement;
    const fpsBadge = this.root.querySelector('#topbar-fps-badge') as HTMLElement;

    if (state.tabs.length === 0 || !state.activeTab) {
      // NO project open: DO NOT show editor behind! Show clean Welcome Screen.
      workspace.style.display = 'none';
      welcomeWrapper.style.display = 'flex';
      saveBtn.style.display = 'none';
      if (undoBtn) undoBtn.style.display = 'none';
      if (redoBtn) redoBtn.style.display = 'none';
      sizeBadge.style.display = 'none';
      fpsBadge.style.display = 'none';

      animationService.pause();
      const files = await storageService.listFiles();
      this.welcomeScreen.setFiles(files);
      return;
    }

    // At least 1 project open: Open directly and hide welcome screen!
    welcomeWrapper.style.display = 'none';
    workspace.style.display = 'grid';
    saveBtn.style.display = 'inline-flex';
    if (undoBtn) undoBtn.style.display = 'inline-flex';
    if (redoBtn) redoBtn.style.display = 'inline-flex';
    sizeBadge.style.display = 'inline-block';
    fpsBadge.style.display = 'inline-block';

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

    const saveBtn = this.root.querySelector('#btn-menu-save') as HTMLButtonElement;
    if (saveBtn) {
      const original = saveBtn.textContent;
      saveBtn.textContent = '✓ Saved!';
      setTimeout(() => {
        saveBtn.textContent = original;
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

      this.frameStrip.update(
        animState.currentFrame,
        animState.totalFrames,
        animState.isPlaying,
        proj.frame_pixels,
        proj.meta.canvas_width,
        proj.meta.canvas_height,
        proj.animations,
        proj.activeAnimationId,
        layerGroups,
        activeGroup,
        isPivot,
        projectService.canUndo(),
        projectService.canRedo()
      );

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
        this.inspectorPanel.update(selectedItem || null);
      }
    });

    // 3. Project service updates
    projectService.subscribe((projState: ProjectState) => {
      const isPivot = this.canvasStage.isPivotMode();
      this.hierarchyTree.update(projState.layers, projState.selectedLayerId, isPivot);

      const anim = animationService.getState();
      const currentInt = Math.round(anim.currentFrame);
      const activeLayer = projState.layers.find((l) => l.id === projState.selectedLayerId);
      const isLayerVisible = activeLayer ? activeLayer.visible !== false : true;
      const layerGroups = activeLayer?.groups || [];
      const activeGroup = projectService.getActiveLayerGroupForFrame(currentInt);
      const pivot = activeGroup?.pivot ?? activeLayer?.pivot ?? activeLayer?.default_transform?.pivot ?? null;
      this.canvasStage.setPivot(pivot);

      const sizeBadge = this.root.querySelector('#topbar-size-badge');
      if (sizeBadge) {
        sizeBadge.textContent = `${projState.meta.canvas_width} × ${projState.meta.canvas_height} px`;
      }

      const fpsBadge = this.root.querySelector('#topbar-fps-badge');
      if (fpsBadge) {
        fpsBadge.textContent = `${projState.meta.fps} FPS`;
      }

      const undoBtn = this.root.querySelector('#btn-topbar-undo') as HTMLButtonElement | null;
      const redoBtn = this.root.querySelector('#btn-topbar-redo') as HTMLButtonElement | null;
      if (undoBtn) undoBtn.disabled = !projectService.canUndo();
      if (redoBtn) redoBtn.disabled = !projectService.canRedo();

      this.canvasStage.setCanvasSize(projState.meta.canvas_width, projState.meta.canvas_height);
      this.animationSettings.setValues(
        projState.meta.canvas_width,
        projState.meta.canvas_height,
        projState.meta.fps,
        this.currentZoom
      );

      const currentPixels = isLayerVisible ? (projState.frame_pixels[currentInt] || {}) : {};
      const prevInt = Math.max(0, currentInt - 1);
      const onionPixels = anim.onionSkinEnabled && currentInt > 0 && isLayerVisible ? (projState.frame_pixels[prevInt] || {}) : null;
      this.canvasStage.setFramePixels(currentPixels, onionPixels);

      this.frameStrip.update(
        anim.currentFrame,
        projState.meta.total_frames,
        anim.isPlaying,
        projState.frame_pixels,
        projState.meta.canvas_width,
        projState.meta.canvas_height,
        projState.animations,
        projState.activeAnimationId,
        layerGroups,
        activeGroup,
        isPivot,
        projectService.canUndo(),
        projectService.canRedo()
      );

      if (anim.resolvedFrame) {
        const selectedItem = anim.resolvedFrame.items.find((i) => i.layer_id === projState.selectedLayerId);
        this.inspectorPanel.update(selectedItem || null);
        this.canvasStage.render(anim.resolvedFrame.items, projState.selectedLayerId, anim.onionSkinFrame?.items);
      }
    });

    // 4. PWA state updates
    pwaService.subscribe((pwa: PwaState) => {
      const installBtn = this.root.querySelector('#pwa-install-btn') as HTMLElement;
      if (installBtn) {
        installBtn.style.display = pwa.isInstallable ? 'inline-flex' : 'none';
      }
    });
  }
}
