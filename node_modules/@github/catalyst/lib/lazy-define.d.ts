declare type ElementLike = Element | Document | ShadowRoot;
export declare function lazyDefine(object: Record<string, () => void>): void;
export declare function lazyDefine(tagName: string, callback: () => void): void;
export declare function observe(target: ElementLike): void;
export {};
//# sourceMappingURL=lazy-define.d.ts.map