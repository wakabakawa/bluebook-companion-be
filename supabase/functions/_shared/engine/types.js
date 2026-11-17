export const DEFAULT_PARAMS = {
    budgetMin: 120,
    minStrong: 1,
    strongThreshold: 0.8,
    minItems: 3,
    priorStrength: 2,
    defaultPrior: 0.5,
    recencyWeight: 0.5,
    halfLifeDays: 7,
    reviewFactor: 2.0,
};
export class InputError extends Error {
    constructor(message) {
        super(message);
        this.name = "InputError";
    }
}
