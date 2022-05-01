class SliderInputElement extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ['disabled', 'placeholder', 'min', 'max', 'step', 'value'];

    #value;

    constructor() {
        super();
        this.internals_ = this.attachInternals();

        this.attachShadow({mode: 'open', delegatesFocus: true});
        this.shadowRoot.innerHTML = `
            <input type="range" aria-hidden="true">
            <input type="number">
        `;
        this.range_input_ = this.shadowRoot.querySelector('[type=range]');
        this.number_input_ = this.shadowRoot.querySelector('[type=number]');
        this.setAttribute('tabindex', 0);
        this.range_input_.addEventListener('input', (evt) => this.value = evt.target.value);
        this.number_input_.addEventListener('input', (evt) => this.value = evt.target.value);
    }

    set disabled(v) { this.attributeChangedCallback('disabled', undefined, v); }
    get form() { return this.internals_.form; }
    get name() { return this.getAttribute('name'); }
    get type() { return this.localName; }
    get value() { return this.#value; }
    set value(v) {
        this.#value = v;
        this.range_input_.value = v;
        this.number_input_.value = v;
        this.internals_.setFormValue(v);
    }
    get validity() { return this.number_input_.validity; }
    get validationMessage() { return this.number_input_.validationMessage; }
    get willValidate() { return this.number_input_.willValidate; }
    checkValidity() { return this.number_input_.checkValidity(); }
    reportValidity() { return this.number_input_.reportValidity(); }
    attributeChangedCallback(name, oldValue, newValue) {
        this.range_input_[name] = newValue;
        this.number_input_[name] = newValue;
    }
    formAssociatedCallback(nullableForm) { /* TODO: Do something */ }
    formStateRestoreCallback(state, mode) { this.value = state; }
    formResetCallback() { this.value = this.getAttribute('value') || ''; }
    formDisabledCallback(disabled) { this.disabled = disabled; }
}

customElements.define('slider-input', SliderInputElement);

function overflows(element) {
    // Triggers reflow, use sparingly.
    return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

function getCharacterAspect(container) {
    let element = document.createElement('span');
    container.appendChild(element);
    element.style.height = 'auto';
    element.style.width = 'auto';
    element.style.position = 'absolute';
    element.style.whiteSpace = 'nowrap';
    element.innerText = '0l'; // "average" character, too narrow is better than too wide.
    
    const rect = element.getBoundingClientRect();
    container.removeChild(element);

    // Get font metrics
    const style = getComputedStyle(container);
    const lineHeight = Number(style.getPropertyValue('line-height').match(/\d+/)[0]);
    const fontSize = Number(style.getPropertyValue('font-size').match(/\d+/)[0]);
    const relativeLineHeight = lineHeight / fontSize;

    // Calculate, factor 2 because innerText is 2 chars
    return rect.width / (2 * rect.height * relativeLineHeight);
}

function roundPrecision(number, precision) {
    return Math.round(number * Math.pow(10, precision)) / Math.pow(10, precision);
}

function resizeText(container, overflowCallback=null) {
    // Add class so css can hide stuff if so desired
    container.classList.add('is-resizing');
    const chars = container.innerText.length;
    const rect = container.getBoundingClientRect()
    const aspect = rect.width / rect.height;
    const textAspect = getCharacterAspect(container);

    // Dry run. Get upperbound on font size cheaply (without triggering reflows)
    let min, max;
    if (aspect < textAspect) {
        min = Math.floor(Math.sqrt(chars));
        max = chars;
    } else {
        min = 1;
        max = Math.ceil(Math.sqrt(chars));
    }

    let rows = 1;
    let rowSize = Math.ceil((rows * aspect) / textAspect);
    while (Math.abs(max - min) > 1 ||  rows * rowSize < chars) {
        rows = Math.ceil((max + min) / 2);
        rowSize = Math.ceil((rows * aspect) / textAspect);
        if (rows * rowSize < chars)
            min = rows;
        else if (rows * rowSize > chars)
            max = rows;
        else
            break;
    }

    // Wet run. Home in on a nice fontsize using the renderer
    let fits = !(overflowCallback?.(container) || overflows(container));
    max = Math.max(100 / rows, 1);
    min = 0;
    size = max;
    let precision = Math.max(roundPrecision(max / 50, 1), .1);
    let count = 0;
    while (Math.abs(max - min) > precision + .01) {
        count++;
        size = roundPrecision((max + min) / 2, 1);
        container.style.setProperty('--font-size', `${size}vh`);
        fits = !(overflowCallback?.(container) || overflows(container));
        if (fits)
            min = size;
        else
            max = size;
    }

    if (!fits)
        container.style.setProperty('--font-size', `${min}vh`);
    container.classList.remove('is-resizing');
}

// function toCamelCase(value) {
//     return value.toLowerCase().replace(
//         /([-_][a-z])/g,
//         group => group.toUpperCase().replace('-', '').replace('_', '')
//     );
// }

// function toKebabCase(value, separator='-') {
//     return value.replace(
//         /[A-Z]+(?![a-z])|[A-Z]/g,
//         (group, offset) => (offset ? separator : '')  + group.toLowerCase()
//     );
// }

function isObject(value) {
    return typeof value === 'object' && value !== null;   
}

function parseBool(value) {
    return typeof value === 'boolean' ? value : value !== 'false';
}

function valueIn() {
    const args = [...arguments];
    return (value) => args.includes(value) ? value : args[0];
}

class Countdown {
    #interval;
    #timestamp;
    #format;

    constructor(element, timestamp=null, format='dhms') {
        this.element = element;
        if (timestamp)
            this.timestamp = timestamp;

        if (format)
            this.#format = format;
    }

    handleInterval() {
        const f = (x) => x.toString().padStart(2, 0);
        const now = new Date().getTime();
        const diff = Math.floor((this.#timestamp - now) / 1000); // In seconds

        if (diff < 0 && this.#interval)
            clearInterval(this.#interval);

        const days = Math.floor(diff / (60 * 60 * 24));
        const hours = Math.floor((diff % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((diff % (60 * 60)) / (60));
        const seconds = Math.floor(diff % 60);

        let formatted;
        if (this.format === 'dhms') {
            formatted = `${days} day${days != 1 ? 's' : ''}, ${f(hours)}:${f(minutes)}:${f(seconds)}`;
        } else if (this.format === 'hms') {
            const hours = Math.floor(diff / (60 * 60));
            formatted = `${f(hours)}:${f(minutes)}:${f(seconds)}`;
        } else if (this.format === 'ms') {
            const minutes = Math.floor(diff / (60));
            formatted = `${f(minutes)}:${f(seconds)}`;
        } else {
            // format is seconds
            formatted = diff;
        }

        this.element.innerText = formatted;
    }

    set timestamp(value) {
        if (value instanceof Date)
            value = value.getTime();
        else if (!Number.isInteger(value))
            value = new Date(value).getTime();

        if (this.#timestamp === value)
            return;

        this.#timestamp = value;

        if (this.#interval)
            clearInterval(this.#interval);

        if (this.#timestamp) {
            this.handleInterval();
            this.#interval = setInterval(this.handleInterval.bind(this), 1000);
        }
    }

    get format() {
        return this.#format;
    }

    set format(value) {
        this.#format = value;
        this.handleInterval();
    }
}

class BigTextOption {
    #value;

    constructor(name, value, spec) {
        this.name = name;

        if (typeof spec === 'object' && spec !== null)
            this.spec = {...spec};
        else
            this.spec = {default: spec};
        
        if (value !== undefined)
            this.value = value;
        else
            this.value = this.spec.default;
    }

    render(context, options) {
        if (this.spec.render)
            return this.spec.render.call(this, context, options);

        if (this.spec.context && this.spec.context in context)
            context = context[this.spec.context];
        else
            context = context.main;

        const cssValue = this.getCssValue(options);
        context.style.setProperty(`--${this.cssName}`, cssValue);
    }

    getCssValue(options) {
        if (this.spec.cssValue)
            return this.spec.cssValue.call(this, this.value, options);
        return this.value;
    }

    get cssName() {
        return this.spec.cssName || this.name;
    }

    get value() {
        return this.#value;
    }

    get inUrl() {
        return this.spec.inUrl !== false;
    }

    set value(value) {
        if (this.spec.sanitize)
            value = this.spec.sanitize(value);
        this.#value = value;
        if (this.spec.updateCallback)
            this.spec.updateCallback(this.name, value);
    }

    get resize() {
        return this.spec.resize || false;
    }
}

class BigText {
    #options;

    constructor(context, spec) {
        this.#options = {};
        this.parseSpec(spec, {updateCallback: this.handleOptionUpdate.bind(this)});

        this.container = context.querySelector('.big-text');
        this.textContainer = this.container.querySelector('.text-wrapper');
        this.textElement = this.container.querySelector('.text-wrapper div');

        this.context = {
            main: this.container,
            imageContainer: this.container.querySelector('.image-wrapper'),
            imageElement: this.container.querySelector('.image-wrapper img'),
            textContainer: this.container.querySelector('.text-wrapper'),
            textElement: this.container.querySelector('.text-wrapper .text'),
            countdownContainer: this.container.querySelector('.countdown-wrapper'),
            countdownElement: this.container.querySelector('.countdown-wrapper .countdown'),
        };

        this.options = new Proxy(this.#options, {set: (o,k,v) => this.setProperty(o,k,v)});

        this.parseUrl(window.location.href);

        for (let option in this.options)
            this.options[option].render(this.context, this.options);

        window.addEventListener('resize', this.handleResize.bind(this));
        this.textElement.addEventListener('input', this.handleResize.bind(this));

        this.controls = new BigTextControls(this, context);

        this.isInitialized = true;
        this.handleResize();
    }

    parseSpec(spec, defaults) {
        for (let option in spec) {
            if (isObject(spec[option]) && 'context' in spec[option] && isObject(spec[option].context)) {
                for (let prefix in spec[option].context) {
                    const d = {...defaults, ...spec[option]};
                    delete d.spec;
                    d.context = spec[option].context[prefix];
                    d.prefix = prefix;
                    this.parseSpec(spec[option].spec, d);
                }
            } else if (isObject(spec[option]) &&'spec' in spec[option]) {
                const d = {...defaults, ...spec[option]};
                delete d.spec;
                if ('prefix' in d && defaults && 'prefix' in defaults) {
                    d.prefix = `${defaults.prefix}-${d.prefix}`;
                } else if (defaults && 'prefix' in defaults) {
                    d.prefix = defaults.prefix;
                }
                this.parseSpec(spec[option].spec, d);
            } else {
                let name = option;
                if (defaults && 'prefix' in defaults)
                    name = `${defaults.prefix}-${option}`;
                this.#options[name] = new BigTextOption(name, undefined, {...defaults, ...spec[option]});
            }
        }
    }

    generateUrl() {
        const baseUrl = new URL(window.location.href);
        const params = baseUrl.searchParams;
        params.set('text', this.textElement.innerText);
        for (let option in this.options)
            if (this.options[option].inUrl)
                params.set(option, this.options[option].value);
        baseUrl.search = params.toString();
        return baseUrl.toString();
    }

    parseUrl(url) {
        if (!(url instanceof URL))
            url = new URL(url);
        const params = url.searchParams;

        if (url.searchParams.has('text'))
            this.textElement.innerText = url.searchParams.get('text');

        for (let option in this.options) {
            if (url.searchParams.has(option))
                this.options[option] = url.searchParams.get(option);
        }
    }

    handleResize() {
        if (this.isInitialized) {
            resizeText(this.context.textContainer);
            if (this.options['has-countdown'].value)
                resizeText(this.context.countdownContainer);
        }
    }

    handleOptionUpdate(key, value) {
        this.controls?.updateForm(key, value);
    }

    setProperty(options, key, value) {
        if (key in options) {
            options[key].value = value
            options[key].render(this.context, this.options);
            if (options[key].resize)
                this.handleResize();
        }
        return true;
    }
}

class BigTextControlForm {
    constructor(bigText, form, prefix=null) {
        this.bigText = bigText;
        this.form = form;
        this.prefix = prefix;

        form.addEventListener('input', this.handleFormInput.bind(this));

        for (let name in bigText.options)
            this.updateForm(name, bigText.options[name].value);
    }

    getOptionName(name) {
        if (this.prefix)
            return `${this.prefix}-${name}`;
        return name;
    }

    getFieldName(name) {
        if (this.prefix && name.startsWith(`${this.prefix}-`))
            return name.slice(this.prefix.length + 1);
        return name;
    }

    handleFormInput(evt) {
        const name = evt.target.name || evt.target.dataset.sync;
        if (!name)
            return;

        if (evt.target.checkValidity && !evt.target.checkValidity()) {
            evt.target.reportValidity();
            return;
        }

        if (evt.target.type === 'checkbox')
            this.bigText.options[this.getOptionName(name)] = evt.target.checked;
        else
            this.bigText.options[this.getOptionName(name)] = evt.target.value;

        if (evt.target.tagName === 'SELECT') {
            const option = evt.target[evt.target.selectedIndex];
            if (option.dataset.set) {
                for (let item of option.dataset.set.split(';')) {
                    let key, value;
                    [key, value] = item.split('=', 2);
                    this.bigText.options[this.getOptionName(key)] = value;
                }
            }
        }

        this.toggleField(name);
    }

    updateForm(name, value) {
        name = this.getFieldName(name);
        const field = this.form.elements[name];

        if (!field)
            return this.toggleField(name);

        if (field && field.type === 'checkbox') {
            field.checked = value;
            for (let el of this.form.querySelectorAll(`[data-sync='${name}']`))
                el.checked = value;
        } else if (field) {
            field.value = value;
            for (let el of this.form.querySelectorAll(`[data-sync='${name}']`))
                el.value = value;
        }

        return this.toggleField(name);
    }

    toggleField(name) {
        for (let el of this.form.querySelectorAll(`[data-toggle*="${name}"]`)) {
            let property = el.dataset.toggleProperty || '!hidden';
            let transform = (x) => x;
            if (property.startsWith('!')) {
                property = property.slice(1);
                transform = (x) => !x;
            }

            let propertyValue = true;
            for (let toggle of el.dataset.toggle.split(',')) {
                let [n, v] = toggle.split('=');
                let neg = false;

                let check = (x) => x;
                if (v === undefined && n.startsWith('!')) {
                    n = n.slice(1);
                    check = (x) => !x;
                } else if (v !== undefined && n.endsWith('!')) {
                    n = n.slice(0, -1);
                    check = (x) => v != x;
                } else if (v !== undefined) {
                    check = (x) => v == x;
                }

                const field = this.form.elements[n];
                if (field)
                    propertyValue &&= !field.checkValidity || field.checkValidity(); // Field has to be valid

                const value = this.bigText.options[this.getOptionName(n)].value;
                propertyValue &&= check(value);
            }

            if (property.startsWith('data-')) {
                if (transform(propertyValue))
                    el.dataset[property.slice(5)] = true;
                else
                    delete el.dataset[property.slice(5)];
            } else {
                el[property] = transform(propertyValue);
            }
        }
    }    
}

class BigTextModal extends BigTextControlForm {
    constructor() {
        super(...arguments);

        for (let el of this.form.querySelectorAll('[data-modal-close]'))
            el.addEventListener('click', this.hide.bind(this));
    }

    show() { this.form.hidden = false; }
    hide() { this.form.hidden = true; }
}

class BigTextControls extends BigTextControlForm {
    constructor(bigText, context) {
        const form = context.querySelector('#settings-form');

        if (bigText.options['controls-enabled']?.value)
            form.hidden = false;
        else
            form.hidden = true;

        super(bigText, form);
        this.context = context;

        context.querySelector('[data-generate-link-button]').addEventListener('click', this.handleGenerateLink.bind(this));

        this.modals = {};
        for (let el of context.querySelectorAll('[data-modal]'))
            el.addEventListener('click', this.handleModal.bind(this));

        for (let el of context.querySelectorAll('.layout-picker-set'))
            this.initLayoutPickerSet(el);
    }

    handleGenerateLink(evt) {
        evt.preventDefault();
        console.log(this.bigText.generateUrl());
    }

    handleModal(evt) {
        const modalId = `${evt.target.dataset.modal}|${evt.target.dataset.prefix}` 
        if (!(modalId in this.modals)) {
            const template = this.context.getElementById(evt.target.dataset.modal);
            const form = template.content.firstElementChild.cloneNode(true);
            document.body.append(form);
            this.modals[modalId] = new BigTextModal(this.bigText, form, evt.target.dataset.prefix);
        }
        this.modals[modalId].show();
    }

    initLayoutPickerSet(element) {
        const trigger = element.querySelector('.trigger');
        trigger.addEventListener('click', () => element.classList.toggle('active'));
        document.addEventListener('click', evt => {
            if (!trigger.contains(evt.target))
                element.classList.remove('active');
        });
    }
}


new BigText(document, {
    'controls-enabled': {
        default: true,
        sanitize: parseBool,
    },
    background: {
        context: {
            'text': 'textContainer',
            'countdown': 'countdownContainer',
        },
        spec: {
            'background-color': {
                default: '#ffffff',
                cssName: 'background-color',
                cssValue(value, options, prefix) {
                    if (this.spec.prefix)
                        return value + options[`${this.spec.prefix}-background-opacity`].getCssValue(options);
                    return value + options['background-opacity'].getCssValue(options);
                },
                sanitize: value => value.toLowerCase(),
            },
            'background-type': {
                default: 'color',
                cssName: 'background',
                cssValue: value => `var(--background-${value})`,
            },
            'background-gradient-type': {
                default: 'linear',
                cssName: 'background-gradient',
                cssValue: value => `var(--background-gradient-${value})`,
                sanitize: value => value.toLowerCase(),
            },
            'background-gradient-direction': {
                default: 0,
                sanitize: parseInt,
                cssName: 'background-gradient-direction',
                cssValue: value => `${value}deg`,
            },
            'background-gradient-end': {
                default: '#999999',
                cssName: 'background-gradient-color',
                cssValue(value, options, prefix) {
                    if (this.spec.prefix)
                        return value + options[`${this.spec.prefix}-background-opacity`].getCssValue(options);
                    return value + options['background-opacity'].getCssValue(options);
                },
                sanitize: value => value.toLowerCase(),
            },
            'background-opacity': {
                default: 255,
                sanitize: parseInt,
                cssValue: value => value.toString(16),
                render(context, options) {
                    if (this.spec.prefix) {
                        options[`${this.spec.prefix}-background-color`].render(...arguments);
                        options[`${this.spec.prefix}-background-gradient-end`].render(...arguments);
                    } else {
                        options['background-color'].render(...arguments);
                        options['background-gradient-end'].render(...arguments);
                    }
                }
            },
        },
    },
    text: {
        context: {
            'text': 'textContainer',
            'countdown': 'countdownContainer',
        },
        spec: {
            'foreground-color': {
                default: '#000000',
                cssName: 'foreground-color',
                sanitize: value => value.toLowerCase(),                
            },
            'font-family': {
                default: 'sans-serif',
                cssName: 'font-family',
                resize: true,
            },
            'font-weight-bold': {
                default: false,
                sanitize: parseBool,
                cssName: 'font-weight',
                cssValue: value => value ? 'bold' : 'normal',
                resize: true,
            },
            'font-style-italic': {
                default: false,
                sanitize: parseBool,
                cssName: 'font-style',
                cssValue: value => value ? 'italic' : 'normal',
            },
            'align': {
                default: 'center',
                cssName: 'text-align',
                sanitize: valueIn('left', 'center', 'right', 'justify'),
            },
            'has-shadow': {
                default: false,
                sanitize: parseBool,
                cssName: 'has-shadow',
                cssValue: value => value ? 'var(--ON)' : 'var(--OFF)',
            },
            'shadow-preset': {
                default: 'regular',
                sanitize: valueIn('regular', 'offset', 'glow', 'fire', 'ugly'),
                cssName: 'shadow',
                cssValue: value => `var(--shadow-${value})`,
            },
            'shadow-color': {
                default: '#000000',
                cssName: 'shadow-color',
                sanitize: value => value.toLowerCase(),                
            },
            'shadow-x': {
                default: 0,
                sanitize: parseFloat,
                cssName: 'shadow-x',
                cssValue: value => `${value}em`,
            },
            'shadow-y': {
                default: 0,
                sanitize: parseFloat,
                cssName: 'shadow-y',
                cssValue: value => `${value}em`,
            },
            'shadow-blur': {
                default: 0.05,
                sanitize: parseFloat,
                cssName: 'shadow-blur',
                cssValue: value => `${value}em`,
            },
            'has-stroke': {
                default: false,
                sanitize: parseBool,
                cssName: 'has-stroke',
                cssValue: value => value ? 'var(--ON)' : 'var(--OFF)',
            },
            'stroke-color': {
                default: '#000000',
                cssName: 'stroke-color',
                sanitize: value => value.toLowerCase(),                
            },
            'stroke-width': {
                default: 0.01,
                sanitize: parseFloat,
                cssName: 'stroke-width',
                cssValue: value => `${value}em`,
            },
        },
    },
    image: {
        spec: {
            'has-image': {
                default: false,
                sanitize: parseBool,
                cssValue: value => value ? 'var(--ON)' : 'var(--OFF)',
                render(context, options) {
                    context.main.classList.remove('has-image', 'has-background-image');
                    if (this.value && options['image-url'].value) {
                        if (options['image-is-background'].value)
                            context.main.classList.add('has-background-image');
                        else
                            context.main.classList.add('has-image');
                    }
                    context.main.style.setProperty('--has-image', this.value ? 'var(--ON)' : 'var(--OFF)');
                    options['layout'].render(...arguments);
                },
                resize: true,
            },
            'image-url': {
                default: '',
                render(context, options) {
                    if (this.value)
                        context.imageElement.src = this.value;
                    options['has-image'].render(...arguments);
                },
                resize: true,
            },
            'image-is-background': {
                default: false,
                sanitize: parseBool,
                render(context, options) {
                    options['has-image'].render(...arguments);
                },
                resize: true,
            },
        },
    },
    countdown: {
        spec: {
            'has-countdown': {
                default: false,
                sanitize: parseBool,
                cssValue: value => value ? 'var(--ON)' : 'var(--OFF)',
                render(context, options) {
                    if (this.value && options['countdown-timestamp'].value)
                        context.main.classList.add('has-countdown');
                    else if (!this.value)
                        context.main.classList.remove('has-countdown');
                    context.main.style.setProperty('--has-countdown', this.value ? 'var(--ON)' : 'var(--OFF)');
                    options['layout'].render(...arguments);
                },
                resize: true,
            },
            'countdown-timestamp': {
                render(context, options) {
                    if (this.value && !this.countdown) {
                        this.countdown = new Countdown(context.countdownElement, this.value, options['countdown-format'].value);
                    } else if (this.value) {
                        this.countdown.timestamp = this.value;
                    }
                    options['has-countdown'].render(...arguments);
                },
                resize: true,
            },
            'countdown-format': {
                default: 'dhms',
                sanitize: valueIn('dhms', 'hms', 'ms', 's'),
                render(context, options) {
                    if (options['countdown-timestamp'].countdown)
                        options['countdown-timestamp'].countdown.format = this.value;
                },
            },
        },
    },
    layout: {
        spec: {
            '_layout-type': {
                default: 'text',
                sanitize: valueIn('text', 'text+image', 'text+countdown', 'text+image+countdown'),
                render(context, options) {
                    if (options['has-countdown'].value && options['has-image'].value && !options['image-is-background'].value)
                        this.value = 'text+image+countdown';
                    else if (options['has-countdown'].value && options['has-image'].value)
                        this.value = 'text+countdown';
                    else if (options['has-countdown'].value)
                        this.value = 'text+countdown';
                    else if (options['has-image'].value && !options['image-is-background'].value)
                        this.value = 'text+image';
                    else
                        this.value = 'text';
                },
                inUrl: false,
            },
            '_layout-group': {
                default: 0,
                render(context, options) {
                    this.value = Math.floor(options['layout'].value / 10);
                },
                inUrl: false,
            },
            'layout': {
                default: 0,
                sanitize(value) {
                    const v = parseInt(value) || 0;
                    if (v < 20)
                        return (Math.floor((v % 20) / 10) * 10) + ((v % 10) % 4);
                    return (Math.floor(v / 10) * 10) + ((v % 10) % 6);
                },
                render(context, options) {
                    options['_layout-type'].render(...arguments);
                    const type = options['_layout-type'].value;
                    if (type === 'text+image')
                        this.value = (Math.floor((this.value % 20) / 10) * 10) + ((this.value % 10) % 2);
                    else if (type === 'text+countdown')
                        this.value = (Math.floor((this.value % 20) / 10) * 10) + ((this.value % 10) % 2) + 2;
                    else if (this.value < 20)
                        this.value += 20;
                    for (let i = 0; i < 80; i++) 
                        context.main.classList.remove(`l${i.toString().padStart(2, 0)}`);
                    context.main.classList.add(`l${this.value.toString().padStart(2, 0)}`);
                    options['_layout-group'].render(...arguments);
                },
                resize: true,        
            },
            'size-1': {
                default: 50,
                sanitize: parseInt,
                cssName: 'grid-size-1',
                cssValue: value => `${value}%`,
                resize: true,
            },
            'size-2': {
                default: 50,
                sanitize: parseInt,
                cssName: 'grid-size-2',
                cssValue: value => `${value}%`,
                resize: true,
            },
            'content-height': {
                default: 100,
                sanitize: parseInt,
                cssValue: value => `${value}%`,
                resize: true,
            },
            'content-width': {
                default: 100,
                sanitize: parseInt,
                cssValue: value => `${value}%`,
                resize: true,
            },
            'content-v-placement': {
                default: 'center',
                sanitize: valueIn('flex-start', 'flex-end', 'center'),
            },
            'content-h-placement': {
                default: 'center',
                sanitize: valueIn('flex-start', 'flex-end', 'center'),
            },
            'content-padding': {
                default: 'regular',
                cssName: 'padding',
                cssValue: value => `var(--padding-${value})`,
                sanitize: valueIn('narrow', 'regular', 'wide', 'ultrawide'),
                resize: true,
            },
        }
    }
});
