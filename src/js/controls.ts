import Captions from './controls/captions';
import Fullscreen from './controls/fullscreen';
import Levels from './controls/levels';
import Play from './controls/play';
import Progress from './controls/progress';
import Settings from './controls/settings';
import Time from './controls/time';
import Volume from './controls/volume';
import PlayerComponent from './interfaces/component';
import ControlItem from './interfaces/control-item';
import EventsList from './interfaces/events-list';
import Player from './player';
import { IS_ANDROID, IS_IOS } from './utils/constants';
import { addEvent } from './utils/events';
import { isVideo } from './utils/general';

/**
 * Controls element.
 *
 * @description This class handles the creation/destruction of all player's control elements.
 * @class Controls
 * @implements PlayerComponent
 */
class Controls implements PlayerComponent {
    private firstLoad:boolean;
    /**
     * Instance of Settings object.
     *
     * @private
     * @type Settings
     * @memberof Controls
     */
    private settings: Settings;

    /**
     * Element that stores the time to hide controls.
     *
     * @private
     * @type number
     * @memberof Controls
     */
    private timer: number;

    /**
     * Main container of control elements.
     *
     * @private
     * @type HTMLDivElement
     * @memberof Controls
     */
    private controls: HTMLDivElement;

    /**
     * Instance of OpenPlayer.
     *
     * @private
     * @type Player
     * @memberof Controls
     */
    private player: Player;

    /**
     * Storage for all the control elements.
     *
     * @private
     * @type any
     * @memberof Controls
     */
    private items: any;

    /**
     * Events that will be triggered in Controls element:
     *  - mouse (to show/hide controls after specific number of seconds)
     *  - media (to trigger/stop timer that will hide or show controls)
     *
     * @private
     * @type EventsList
     * @memberof Controls
     */
    private events: EventsList = {
        media: {},
        mouse: {},
    };

    private controlEls: any = {
        Captions,
        Fullscreen,
        Levels,
        Play,
        Progress,
        Settings,
        Time,
        Volume,
    };

    /**
     * Create an instance of Controls.
     *
     * @param {Player} player
     * @returns {Controls}
     * @memberof Controls
     */
    constructor(player: Player) {
        this.player = player;
        this._setElements();
        return this;
    }

    /**
     *
     * @inheritDoc
     * @memberof Controls
     */
    public create(): void {
        this.firstLoad = true;
        this.player.getElement().controls = false;

        const isMediaVideo = isVideo(this.player.getElement());

        this.controls = document.createElement('div');
        this.controls.className = 'op-controls';
        this.player.getContainer().appendChild(this.controls);

        this._buildElements();

        this.events.controlschanged = () => {
            this.destroy();
            this._setElements();
            this.create();
        };

        this.events.ended = () => {
            this.player.getContainer().classList.remove('op-controls--hidden');
        };

        this.player.getElement().addEventListener('controlschanged', this.events.controlschanged);
        this.player.getElement().addEventListener('ended', this.events.ended);

        if (!IS_ANDROID && !IS_IOS) {
            this.events.mouse.mouseenter = () => {
                if (isMediaVideo && this.player.isMedia() && !this.player.activeElement().paused) {
                    this._stopControlTimer();
                    if (this.player.activeElement().currentTime) {
                        this.player.playBtn.setAttribute('aria-hidden', 'false');
                        this.player.loader.setAttribute('aria-hidden', 'true');
                    } else if (this.player.getOptions().showLoaderOnInit) {
                        this.player.playBtn.setAttribute('aria-hidden', 'true');
                        this.player.loader.setAttribute('aria-hidden', 'false');
                    }
                    this.player.getContainer().classList.remove('op-controls--hidden');
                    this._startControlTimer(2500);
                }
            };
            this.events.mouse.mousemove = () => {
                if (isMediaVideo && this.player.isMedia() && !this.player.activeElement().paused) {
                    if (this.player.activeElement().currentTime) {
                        this.player.loader.setAttribute('aria-hidden', 'true');
                        this.player.playBtn.setAttribute('aria-hidden', 'false');
                    } else if (this.player.getOptions().showLoaderOnInit) {
                        this.player.playBtn.setAttribute('aria-hidden', 'true');
                        this.player.loader.setAttribute('aria-hidden', 'false');
                    }

                    this.player.getContainer().classList.remove('op-controls--hidden');
                    this._startControlTimer(2500);
                }
            };
            this.events.mouse.mouseleave = () => {
                if (isMediaVideo && this.player.isMedia() && !this.player.activeElement().paused) {
                    this._startControlTimer(1000);
                }
            };
            this.events.media.play = () => {
                if (isMediaVideo) {
                    this._startControlTimer(this.player.getOptions().hidePlayBtnTimer);
                }
            };
            this.events.media.pause = () => {
                this.player.getContainer().classList.remove('op-controls--hidden');
                this._stopControlTimer();
            };
            Object.keys(this.events.media).forEach(event => {
                this.player.getElement().addEventListener(event, this.events.media[event]);
            });

            Object.keys(this.events.mouse).forEach(event => {
                this.player.getContainer().addEventListener(event, this.events.mouse[event]);
            });

            this.player.getContainer().classList.add('op-controls--hidden');
            // Initial countdown to hide controls
            this._startControlTimer(3000);
        }
    }

    /**
     *
     * @inheritDoc
     * @memberof Controls
     */
    public destroy(): void {
        if (!IS_ANDROID && !IS_IOS) {
            Object.keys(this.events.mouse).forEach(event => {
                this.player.getContainer().removeEventListener(event, this.events.mouse[event]);
            });

            Object.keys(this.events.media).forEach(event => {
                this.player.getElement().removeEventListener(event, this.events.media[event]);
            });

            this._stopControlTimer();
        }

        this.player.getElement().removeEventListener('controlschanged', this.events.controlschanged);
        this.player.getElement().removeEventListener('ended', this.events.ended);

        Object.keys(this.items).forEach((position: string) => {
            this.items[position].forEach((item: any) => {
                if (item.custom) {
                    this._destroyCustomControl(item);
                } else if (typeof item.destroy === 'function') {
                    item.destroy();
                }
            });
        });

        this.controls.remove();
    }

    /**
     * Retrieve the main container of all control elements, to add/remove them in latter steps.
     *
     * @returns {HTMLDivElement}
     * @memberof Controls
     */
    public getContainer(): HTMLDivElement {
        return this.controls;
    }

    /**
     * Set timer to hide controls.
     *
     * @private
     * @param {number} time The time when controls will be hidden in milliseconds (ms).
     * @memberof Controls
     */
    private _startControlTimer(time: number): void {
        const el = this.player.activeElement();
        this._stopControlTimer();

        this.timer = window.setTimeout(() => {
            if ((/*!el.loaded ||*/ !el.paused || !el.ended) && isVideo(this.player.getElement())) {
                this.player.getContainer().classList.add('op-controls--hidden');
                if(!this.firstLoad) {
                    this.player.playBtn.setAttribute('aria-hidden', 'true');
                }
                this.firstLoad = false;
                this._stopControlTimer();
                const event = addEvent('controlshidden');
                this.player.getElement().dispatchEvent(event);
            }
        }, time);
    }

    /**
     * Stop timer to hide controls.
     *
     * @private
     * @memberof Controls
     */
    private _stopControlTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            delete this.timer;
            this.timer = null;
        }
    }

    /**
     * Instantiate all control elements' classes and store them in `items` element.
     *
     * @see [[Controls.items]]
     * @private
     * @memberof Controls
     */
    private _setElements(): void {
        const controls = this.player.getOptions().controls;
        this.items = {
            left: [],
            middle: [],
            right: [],
        };

        Object.keys(controls).forEach((position: string) => {
            controls[position]
                .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
                .forEach((el: string) => {
                    const className = `${el.charAt(0).toUpperCase()}${el.slice(1)}`;
                    const item = new this.controlEls[className](this.player, position);
                    if (el === 'settings') {
                        this.settings = item;
                    }

                    if (el !== 'fullscreen') {
                        this.items[position].push(item);
                    }
                });
        });

        // Append/prepend the custom items (if any) depending on their position:
        // If position is right, always prepend so Settings and Fullscreen are the last items;
        // otherwise, append new controls
        this.player.getCustomControls().forEach(item => {
            if (item.position === 'right') {
                this.items[item.position].unshift(item);
            } else {
                this.items[item.position].push(item);
            }
        });

        // Make sure fullscreen is always the last one
        if (isVideo(this.player.getElement())) {
            this.items.right.push(new Fullscreen(this.player, 'right'));
        }
    }

    /**
     * Create markup for all control elements and, if available, create entries for Settings element.
     *
     * It will dispatch a `controlschanged` event to reload all elements in the control bar.
     * @see [[Settings.addItem]]
     * @see [[Settings.addSettings]]
     * @private
     * @memberof Controls
     */
    private _buildElements(): void {
        // Loop controls to build them and register events
        Object.keys(this.items).forEach((position: string) => {
            this.items[position].forEach((item: any) => {
                if (item.custom) {
                    this._createCustomControl(item);
                } else {
                    item.create();
                }
            });
        });

        Object.keys(this.items).forEach((position: string) => {
            this.items[position].forEach((item: any) => {
                const allowDefault = !this.player.getOptions().detachMenus || item instanceof Settings;
                if (allowDefault && !item.custom && typeof item.addSettings === 'function') {
                    const menuItem = item.addSettings();
                    if (Object.keys(menuItem).length) {
                        this.settings.addItem(
                            menuItem.name,
                            menuItem.key,
                            menuItem.default,
                            menuItem.subitems,
                            menuItem.className,
                        );
                    }
                }
            });
        });

        const e = addEvent('controlschanged');
        this.controls.dispatchEvent(e);
    }

    /**
     * Create a button for custom control items and activate `click` event on it.
     *
     * @private
     * @param {ControlItem} item
     * @memberof Controls
     */
    private _createCustomControl(item: ControlItem): void {
        const control = document.createElement('button');
        const key = item.title.toLowerCase().replace(' ', '-');
        control.className = `op-controls__${key} op-control__${item.position}`;
        control.tabIndex = 0;
        control.title = item.title;
        control.innerHTML = `<img src="${item.icon}"> <span class="op-sr">${item.title}</span>`;
        control.addEventListener('click', item.click);
        this.getContainer().appendChild(control);
    }

    /**
     * Remove a custom control button and deactivate `click` event on it.
     *
     * @private
     * @param {ControlItem} item
     * @memberof Controls
     */
    private _destroyCustomControl(item: ControlItem): void {
        const key = item.title.toLowerCase().replace(' ', '-');
        const control = this.getContainer().querySelector(`.op-controls__${key}`);
        control.removeEventListener('click', item.click);
        control.remove();
    }
}

export default Controls;
