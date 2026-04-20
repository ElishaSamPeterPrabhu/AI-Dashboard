import { CatalystDelegate } from './core.js';
export function controller(classObjectOrName) {
    if (typeof classObjectOrName === 'string') {
        return (classObject) => {
            new CatalystDelegate(classObject, classObjectOrName);
        };
    }
    new CatalystDelegate(classObjectOrName);
}
//# sourceMappingURL=controller.js.map