var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                let j = 0;
                const remove = [];
                while (j < node.attributes.length) {
                    const attribute = node.attributes[j++];
                    if (!attributes[attribute.name]) {
                        remove.push(attribute.name);
                    }
                }
                for (let k = 0; k < remove.length; k++) {
                    node.removeAttribute(remove[k]);
                }
                return nodes.splice(i, 1)[0];
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    function query_selector_all(selector, parent = document.body) {
        return Array.from(parent.querySelectorAll(selector));
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\components\Nav.svelte generated by Svelte v3.24.1 */

    const file = "src\\components\\Nav.svelte";

    function create_fragment(ctx) {
    	let nav;
    	let ul;
    	let li0;
    	let a0;
    	let t0;
    	let a0_aria_current_value;
    	let t1;
    	let li1;
    	let a1;
    	let t2;
    	let a1_aria_current_value;
    	let t3;
    	let li2;
    	let a2;
    	let t4;
    	let a2_aria_current_value;

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			ul = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			t0 = text("home");
    			t1 = space();
    			li1 = element("li");
    			a1 = element("a");
    			t2 = text("about");
    			t3 = space();
    			li2 = element("li");
    			a2 = element("a");
    			t4 = text("blog");
    			this.h();
    		},
    		l: function claim(nodes) {
    			nav = claim_element(nodes, "NAV", { class: true });
    			var nav_nodes = children(nav);
    			ul = claim_element(nav_nodes, "UL", { class: true });
    			var ul_nodes = children(ul);
    			li0 = claim_element(ul_nodes, "LI", { class: true });
    			var li0_nodes = children(li0);

    			a0 = claim_element(li0_nodes, "A", {
    				"aria-current": true,
    				href: true,
    				class: true
    			});

    			var a0_nodes = children(a0);
    			t0 = claim_text(a0_nodes, "home");
    			a0_nodes.forEach(detach_dev);
    			li0_nodes.forEach(detach_dev);
    			t1 = claim_space(ul_nodes);
    			li1 = claim_element(ul_nodes, "LI", { class: true });
    			var li1_nodes = children(li1);

    			a1 = claim_element(li1_nodes, "A", {
    				"aria-current": true,
    				href: true,
    				class: true
    			});

    			var a1_nodes = children(a1);
    			t2 = claim_text(a1_nodes, "about");
    			a1_nodes.forEach(detach_dev);
    			li1_nodes.forEach(detach_dev);
    			t3 = claim_space(ul_nodes);
    			li2 = claim_element(ul_nodes, "LI", { class: true });
    			var li2_nodes = children(li2);

    			a2 = claim_element(li2_nodes, "A", {
    				rel: true,
    				"aria-current": true,
    				href: true,
    				class: true
    			});

    			var a2_nodes = children(a2);
    			t4 = claim_text(a2_nodes, "blog");
    			a2_nodes.forEach(detach_dev);
    			li2_nodes.forEach(detach_dev);
    			ul_nodes.forEach(detach_dev);
    			nav_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(a0, "aria-current", a0_aria_current_value = /*segment*/ ctx[0] === undefined ? "page" : undefined);
    			attr_dev(a0, "href", ".");
    			attr_dev(a0, "class", "svelte-1qjsjys");
    			add_location(a0, file, 57, 12, 1016);
    			attr_dev(li0, "class", "svelte-1qjsjys");
    			add_location(li0, file, 57, 8, 1012);
    			attr_dev(a1, "aria-current", a1_aria_current_value = /*segment*/ ctx[0] === "about" ? "page" : undefined);
    			attr_dev(a1, "href", "about");
    			attr_dev(a1, "class", "svelte-1qjsjys");
    			add_location(a1, file, 58, 12, 1115);
    			attr_dev(li1, "class", "svelte-1qjsjys");
    			add_location(li1, file, 58, 8, 1111);
    			attr_dev(a2, "rel", "prefetch");
    			attr_dev(a2, "aria-current", a2_aria_current_value = /*segment*/ ctx[0] === "blog" ? "page" : undefined);
    			attr_dev(a2, "href", "blog");
    			attr_dev(a2, "class", "svelte-1qjsjys");
    			add_location(a2, file, 62, 12, 1390);
    			attr_dev(li2, "class", "svelte-1qjsjys");
    			add_location(li2, file, 62, 8, 1386);
    			attr_dev(ul, "class", "svelte-1qjsjys");
    			add_location(ul, file, 56, 4, 998);
    			attr_dev(nav, "class", "svelte-1qjsjys");
    			add_location(nav, file, 55, 0, 987);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, ul);
    			append_dev(ul, li0);
    			append_dev(li0, a0);
    			append_dev(a0, t0);
    			append_dev(ul, t1);
    			append_dev(ul, li1);
    			append_dev(li1, a1);
    			append_dev(a1, t2);
    			append_dev(ul, t3);
    			append_dev(ul, li2);
    			append_dev(li2, a2);
    			append_dev(a2, t4);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*segment*/ 1 && a0_aria_current_value !== (a0_aria_current_value = /*segment*/ ctx[0] === undefined ? "page" : undefined)) {
    				attr_dev(a0, "aria-current", a0_aria_current_value);
    			}

    			if (dirty & /*segment*/ 1 && a1_aria_current_value !== (a1_aria_current_value = /*segment*/ ctx[0] === "about" ? "page" : undefined)) {
    				attr_dev(a1, "aria-current", a1_aria_current_value);
    			}

    			if (dirty & /*segment*/ 1 && a2_aria_current_value !== (a2_aria_current_value = /*segment*/ ctx[0] === "blog" ? "page" : undefined)) {
    				attr_dev(a2, "aria-current", a2_aria_current_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const initialDataNav = { title: "Navigation title" };

    function instance($$self, $$props, $$invalidate) {
    	let { segment } = $$props;
    	const writable_props = ["segment"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Nav", $$slots, []);

    	$$self.$$set = $$props => {
    		if ("segment" in $$props) $$invalidate(0, segment = $$props.segment);
    	};

    	$$self.$capture_state = () => ({ initialDataNav, segment });

    	$$self.$inject_state = $$props => {
    		if ("segment" in $$props) $$invalidate(0, segment = $$props.segment);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [segment];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { segment: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*segment*/ ctx[0] === undefined && !("segment" in props)) {
    			console.warn("<Nav> was created without expected prop 'segment'");
    		}
    	}

    	get segment() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set segment(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\pages\index.svelte generated by Svelte v3.24.1 */
    const file$1 = "src\\pages\\index.svelte";

    function create_fragment$1(ctx) {
    	let t0;
    	let main;
    	let h1;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let p0;
    	let t5;
    	let a;
    	let t6;
    	let t7;
    	let t8;
    	let nav;
    	let t9;
    	let h2;
    	let t10;
    	let t11;
    	let p1;
    	let t12;
    	let t13;
    	let p2;
    	let t14_value = initialData.init + "";
    	let t14;
    	let current;
    	nav = new Nav({ $$inline: true });

    	const block = {
    		c: function create() {
    			t0 = space();
    			main = element("main");
    			h1 = element("h1");
    			t1 = text("Hello ");
    			t2 = text(/*name*/ ctx[0]);
    			t3 = text("!");
    			t4 = space();
    			p0 = element("p");
    			t5 = text("Visit the ");
    			a = element("a");
    			t6 = text("Svelte tutorial");
    			t7 = text(" to learn how to build Svelte apps.");
    			t8 = space();
    			create_component(nav.$$.fragment);
    			t9 = space();
    			h2 = element("h2");
    			t10 = text("message");
    			t11 = space();
    			p1 = element("p");
    			t12 = text(/*message*/ ctx[1]);
    			t13 = space();
    			p2 = element("p");
    			t14 = text(t14_value);
    			this.h();
    		},
    		l: function claim(nodes) {
    			const head_nodes = query_selector_all("[data-svelte=\"svelte-18a1olg\"]", document.head);
    			head_nodes.forEach(detach_dev);
    			t0 = claim_space(nodes);
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			h1 = claim_element(main_nodes, "H1", { class: true });
    			var h1_nodes = children(h1);
    			t1 = claim_text(h1_nodes, "Hello ");
    			t2 = claim_text(h1_nodes, /*name*/ ctx[0]);
    			t3 = claim_text(h1_nodes, "!");
    			h1_nodes.forEach(detach_dev);
    			t4 = claim_space(main_nodes);
    			p0 = claim_element(main_nodes, "P", {});
    			var p0_nodes = children(p0);
    			t5 = claim_text(p0_nodes, "Visit the ");
    			a = claim_element(p0_nodes, "A", { href: true });
    			var a_nodes = children(a);
    			t6 = claim_text(a_nodes, "Svelte tutorial");
    			a_nodes.forEach(detach_dev);
    			t7 = claim_text(p0_nodes, " to learn how to build Svelte apps.");
    			p0_nodes.forEach(detach_dev);
    			t8 = claim_space(main_nodes);
    			claim_component(nav.$$.fragment, main_nodes);
    			t9 = claim_space(main_nodes);
    			h2 = claim_element(main_nodes, "H2", {});
    			var h2_nodes = children(h2);
    			t10 = claim_text(h2_nodes, "message");
    			h2_nodes.forEach(detach_dev);
    			t11 = claim_space(main_nodes);
    			p1 = claim_element(main_nodes, "P", {});
    			var p1_nodes = children(p1);
    			t12 = claim_text(p1_nodes, /*message*/ ctx[1]);
    			p1_nodes.forEach(detach_dev);
    			t13 = claim_space(main_nodes);
    			p2 = claim_element(main_nodes, "P", {});
    			var p2_nodes = children(p2);
    			t14 = claim_text(p2_nodes, t14_value);
    			p2_nodes.forEach(detach_dev);
    			main_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			document.title = "App title";
    			attr_dev(h1, "class", "svelte-1pjgtjm");
    			add_location(h1, file$1, 25, 4, 539);
    			attr_dev(a, "href", "https://svelte.dev/tutorial");
    			add_location(a, file$1, 26, 17, 580);
    			add_location(p0, file$1, 26, 4, 567);
    			add_location(h2, file$1, 29, 4, 701);
    			add_location(p1, file$1, 30, 4, 723);
    			add_location(p2, file$1, 31, 4, 745);
    			attr_dev(main, "class", "svelte-1pjgtjm");
    			add_location(main, file$1, 24, 0, 527);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, h1);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			append_dev(h1, t3);
    			append_dev(main, t4);
    			append_dev(main, p0);
    			append_dev(p0, t5);
    			append_dev(p0, a);
    			append_dev(a, t6);
    			append_dev(p0, t7);
    			append_dev(main, t8);
    			mount_component(nav, main, null);
    			append_dev(main, t9);
    			append_dev(main, h2);
    			append_dev(h2, t10);
    			append_dev(main, t11);
    			append_dev(main, p1);
    			append_dev(p1, t12);
    			append_dev(main, t13);
    			append_dev(main, p2);
    			append_dev(p2, t14);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*name*/ 1) set_data_dev(t2, /*name*/ ctx[0]);
    			if (!current || dirty & /*message*/ 2) set_data_dev(t12, /*message*/ ctx[1]);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(nav.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			destroy_component(nav);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const initialData = { "init": "init with this data" }; //navigation: iNav

    function instance$1($$self, $$props, $$invalidate) {
    	let { name } = $$props;
    	let { message } = $$props;

    	const getStaticProps = () => {
    		return { props: "my static props" };
    	};

    	const writable_props = ["name", "message"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Pages> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Pages", $$slots, []);

    	$$self.$$set = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("message" in $$props) $$invalidate(1, message = $$props.message);
    	};

    	$$self.$capture_state = () => ({
    		initialData,
    		Nav,
    		name,
    		message,
    		getStaticProps
    	});

    	$$self.$inject_state = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("message" in $$props) $$invalidate(1, message = $$props.message);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [name, message, getStaticProps];
    }

    class Pages extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { name: 0, message: 1, getStaticProps: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Pages",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*name*/ ctx[0] === undefined && !("name" in props)) {
    			console.warn("<Pages> was created without expected prop 'name'");
    		}

    		if (/*message*/ ctx[1] === undefined && !("message" in props)) {
    			console.warn("<Pages> was created without expected prop 'message'");
    		}
    	}

    	get name() {
    		throw new Error("<Pages>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<Pages>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get message() {
    		throw new Error("<Pages>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set message(value) {
    		throw new Error("<Pages>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getStaticProps() {
    		return this.$$.ctx[2];
    	}

    	set getStaticProps(value) {
    		throw new Error("<Pages>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new Pages({
                            target: document.getElementById('mangoost'),
                            hydrate: true,
                            props: {
                                name: "world"
                            }
                        });

    return app;

}());
//# sourceMappingURL=index.js.map
