import {
  ObjectValueDescription,
  PlaceholderFunctionValueDescription,
  StringPart,
  getTypeFrom,
  Arg,
  PluralFunctionValueDescription,
  ArgType,
  ValueDescription,
  ValueDescriptionType,
  isPrimitiveValueDescription,
  PrimitiveValueDescription,
  isPrimitiveStringValueDescription,
  ArrayValueDescription
} from "../Intermediate/IntermediateStructure";
import { placeholderRegex, getAllMatches } from "./RegexUtils";
import { PluralFormObject, PrimitiveJsonType, pluralFormNthKey } from "./JsonStructure";

export default function convertObject(value: {}): ObjectValueDescription | PluralFunctionValueDescription {
  return isPluralFormObject(value) ? convertPluralFormObject(value) : convertSimpleObject(value);
}

function convertPluralFormObject(obj: PluralFormObject): PluralFunctionValueDescription {
  const fixedCountArg = { name: "count", type: ArgType.Number };
  const argSet = createArgSet([fixedCountArg]);
  const values = getPluralFunctionValues(obj[pluralFormNthKey]);

  const keys = Object.keys(obj).filter((key) => key !== pluralFormNthKey);
  for (const key of keys) {
    const valueDescription = convertString(obj[key]);

    if (isPrimitiveStringValueDescription(valueDescription)) {
      values[key] = valueDescription.value;
      continue;
    }

    for (const arg of valueDescription.args) {
      argSet.add(arg);
    }

    values[key] = valueDescription.stringParts;
  }

  return {
    type: ValueDescriptionType.PluralFunction,
    args: argSet.args,
    values
  };
}

function getPluralFunctionValues(nthValue: string) {
  const nthValueDescription = convertString(nthValue);

  return isPrimitiveValueDescription(nthValueDescription)
    ? { n: nthValueDescription.value }
    : { n: nthValueDescription.stringParts };
}

function convertSimpleObject(obj: {}): ObjectValueDescription {
  const propertyDescriptions = new Map<string, ValueDescription>();
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = obj[key];
    const valueDescription = convertValue(value);

    propertyDescriptions.set(key, valueDescription);
  }

  return {
    type: ValueDescriptionType.Object,
    propertyDescriptions
  };
}

// tslint:disable-next-line: no-any
function convertArray(values: any[]): ArrayValueDescription {
  const valueDescriptions = values.map((value) => convertValue(value));

  return {
    type: ValueDescriptionType.Array,
    valueDescriptions
  };
}

// tslint:disable-next-line: no-any
function convertValue(value: any) {
  const valueType = typeof value;

  if (valueType === "string") {
    return convertString(value);
  }

  if (Array.isArray(value)) {
    return convertArray(value);
  }

  if (valueType === "object") {
    return convertObject(value);
  }

  return convertPrimitive(value);
}

function convertPrimitive(value: PrimitiveJsonType): PrimitiveValueDescription {
  return {
    type: ValueDescriptionType.Primitive,
    value
  };
}

function convertString(value: string): PrimitiveValueDescription<string> | PlaceholderFunctionValueDescription {
  const placeholderMatches = Array.from(getAllMatches(value, placeholderRegex));

  return placeholderMatches.length === 0
    ? (convertPrimitive(value) as PrimitiveValueDescription<string>)
    : convertStringToPlaceholderFunction(value, placeholderMatches);
}

function convertStringToPlaceholderFunction(
  value: string,
  placeholderMatches: RegExpExecArray[]
): PlaceholderFunctionValueDescription {
  const argSet = createArgSet();
  const stringPartsBuilder = createStringPartsBuilder(value);

  for (const placeholderMatch of placeholderMatches) {
    const arg = {
      name: placeholderMatch[1],
      type: getTypeFrom(placeholderMatch[2])
    };

    argSet.add(arg);
    stringPartsBuilder.add(arg, placeholderMatch[0]);
  }

  return {
    type: ValueDescriptionType.PlaceholderFunction,
    args: argSet.args,
    stringParts: stringPartsBuilder.stringPart
  };
}

function isPluralFormObject(obj: { [pluralFormNthKey]?: string }): obj is PluralFormObject {
  return (
    obj[pluralFormNthKey] !== undefined &&
    Object.keys(obj).every((key) => (key === pluralFormNthKey || /^\d+$/.test(key)) && typeof obj[key] === "string")
  );
}

function createArgSet(initialArgs: Arg[] = []) {
  const argMap = new Map<string, Arg>(initialArgs.map((initialArg) => [initialArg.name, initialArg]));

  return {
    add(arg: Arg) {
      if (argMap.has(arg.name)) {
        return;
      }

      argMap.set(arg.name, arg);
    },
    get args() {
      return Array.from(argMap.values());
    }
  };
}

function createStringPartsBuilder(value: string) {
  const stringPart: StringPart = [];
  let unprocessedValue = value;

  return {
    add(arg: Arg, argStringMatch: string) {
      const splitValue = unprocessedValue.split(argStringMatch);
      unprocessedValue = splitValue[1];

      if (splitValue[0] !== "") {
        stringPart.push(splitValue[0]);
      }

      stringPart.push({ name: arg.name });
    },
    get stringPart() {
      if (unprocessedValue !== "") {
        stringPart.push(unprocessedValue);
      }

      return stringPart;
    }
  };
}
