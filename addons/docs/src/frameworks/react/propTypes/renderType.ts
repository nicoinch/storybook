import { isNil } from 'lodash';
import { ReactNode } from 'react';
import { ExtractedProp } from '../../../lib2/extractDocgenProps';
import { ExtractedJsDocParam } from '../../../lib2/jsdocParser';
import { createPropText } from '../../../lib2/createComponents';
import { PropTypesType } from './types';
import { InspectionType, inspectValue } from './inspectValue';

// TODO: For shapes, need to somehow add <br /> between values. Does br works in title?

const MAX_CAPTION_LENGTH = 35;

interface PropType {
  name: string;
  value?: any;
  computed?: boolean;
  raw?: string;
  description?: string;
}

interface EnumValue {
  value: string;
  computed: boolean;
}

interface TypeDef {
  name: string;
  caption: string;
  value: string;
  inferedType?: InspectionType;
}

function shortifyPropTypes(value: string): string {
  return value.replace(/PropTypes./g, '').replace(/.isRequired/g, '');
}

function createTypeDef({
  name,
  caption,
  value,
  inferedType,
}: {
  name: string;
  caption: string;
  value?: string;
  inferedType?: InspectionType;
}): TypeDef {
  return {
    name,
    caption,
    value: !isNil(value) ? value : caption,
    inferedType,
  };
}

// TODO: Fix "oneOfComplexShapes"
function generateComputedValue(typeName: string, value: string): TypeDef {
  const { inferedType } = inspectValue(value);

  return createTypeDef({
    name: typeName,
    caption: inferedType.toString(),
    value: inferedType === InspectionType.OBJECT ? shortifyPropTypes(value) : value,
    inferedType,
  });
}

function generateCustom({ raw }: PropType): TypeDef {
  if (!isNil(raw)) {
    const { inferedType } = inspectValue(raw);

    const value = inferedType === InspectionType.OBJECT ? shortifyPropTypes(raw) : raw;

    return createTypeDef({
      name: PropTypesType.CUSTOM,
      caption: value.length <= MAX_CAPTION_LENGTH ? value : 'custom',
      value,
      inferedType,
    });
  }

  return createTypeDef({ name: PropTypesType.CUSTOM, caption: 'custom' });
}

function generateFuncSignature(
  { jsDocTags }: ExtractedProp,
  hasParams: boolean,
  hasReturns: boolean
): string {
  const funcParts = [];

  if (hasParams) {
    const funcParams = jsDocTags.params.map((x: ExtractedJsDocParam) => {
      const prettyName = x.getPrettyName();
      const typeName = x.getTypeName();

      if (!isNil(typeName)) {
        return `${prettyName}: ${typeName}`;
      }

      return prettyName;
    });

    funcParts.push(`(${funcParams.join(', ')})`);
  } else {
    funcParts.push('()');
  }

  if (hasReturns) {
    funcParts.push(`=> ${jsDocTags.returns.getTypeName()}`);
  }

  return funcParts.join(' ');
}

function generateFunc(extractedProp: ExtractedProp): TypeDef {
  const { jsDocTags } = extractedProp;

  if (!isNil(jsDocTags)) {
    const hasParams = !isNil(jsDocTags.params);
    const hasReturns = !isNil(jsDocTags.returns);

    if (hasParams || hasReturns) {
      return createTypeDef({
        name: PropTypesType.FUNC,
        caption: 'func',
        value: generateFuncSignature(extractedProp, hasParams, hasReturns),
      });
    }
  }

  return createTypeDef({ name: PropTypesType.FUNC, caption: 'func' });
}

function generateShape(type: PropType, extractedProp: ExtractedProp): TypeDef {
  const fields = Object.keys(type.value)
    .map((key: string) => `${key}: ${generateType(type.value[key], extractedProp).value}`)
    .join(', ');

  const shape = `{ ${fields} }`;

  return createTypeDef({
    name: PropTypesType.SHAPE,
    caption: shape.length <= MAX_CAPTION_LENGTH ? shape : 'object',
    value: shape,
  });
}

function generateObjectOf(type: PropType, extractedProp: ExtractedProp): TypeDef {
  const format = (of: string) => `objectOf(${of})`;

  // eslint-disable-next-line prefer-const
  let { name, caption, value, inferedType } = generateType(type.value, extractedProp);

  if (name === PropTypesType.CUSTOM) {
    if (!isNil(inferedType)) {
      if (inferedType !== InspectionType.STRING && inferedType !== InspectionType.OBJECT) {
        caption = inferedType.toString();
      }
    }
  } else if (name === PropTypesType.SHAPE) {
    if (value.length <= MAX_CAPTION_LENGTH) {
      caption = value;
    }
  }

  return createTypeDef({
    name: PropTypesType.OBJECTOF,
    caption: format(caption),
    value: format(value),
  });
}

function generateUnion(type: PropType, extractedProp: ExtractedProp): TypeDef {
  if (Array.isArray(type.value)) {
    const values = type.value.reduce(
      (acc: any, v: any) => {
        const { caption, value } = generateType(v, extractedProp);

        acc.caption.push(caption);
        acc.value.push(value);

        return acc;
      },
      { caption: [], value: [] }
    );

    return createTypeDef({
      name: PropTypesType.UNION,
      caption: values.caption.join(' | '),
      value: values.value.join(' | '),
    });
  }

  return createTypeDef({ name: PropTypesType.UNION, caption: type.value });
}

function generateEnumValue({ value, computed }: EnumValue): TypeDef {
  return computed
    ? generateComputedValue('enumvalue', value)
    : createTypeDef({ name: 'enumvalue', caption: value });
}

function generateEnum(type: PropType): TypeDef {
  if (Array.isArray(type.value)) {
    const values = type.value.reduce(
      (acc: any, v: EnumValue) => {
        const { caption, value } = generateEnumValue(v);

        acc.caption.push(caption);
        acc.value.push(value);

        return acc;
      },
      { caption: [], value: [] }
    );

    return createTypeDef({
      name: PropTypesType.ENUM,
      caption: values.caption.join(' | '),
      value: values.value.join(' | '),
    });
  }

  return createTypeDef({ name: PropTypesType.ENUM, caption: type.value });
}

function generateArray(type: PropType, extractedProp: ExtractedProp): TypeDef {
  const braceAfter = (of: string) => `${of}[]`;
  const braceAround = (of: string) => `[${of}]`;

  // eslint-disable-next-line prefer-const
  let { name, caption, value, inferedType } = generateType(type.value, extractedProp);

  if (name === PropTypesType.CUSTOM) {
    if (!isNil(inferedType)) {
      if (inferedType !== InspectionType.STRING && inferedType !== InspectionType.OBJECT) {
        caption = inferedType.toString();
      } else if (inferedType === InspectionType.OBJECT) {
        // Brace around inlined objects.
        // Show the inlined object if it's short.
        caption =
          value.length <= MAX_CAPTION_LENGTH
            ? braceAround(value)
            : braceAfter(inferedType.toString());
        value = braceAround(value);

        return createTypeDef({ name: PropTypesType.ARRAYOF, caption, value });
      }
    }
  } else if (name === PropTypesType.SHAPE) {
    // Brace around objects.
    caption = value.length <= MAX_CAPTION_LENGTH ? braceAround(value) : braceAfter(caption);
    value = braceAround(value);

    return createTypeDef({ name: PropTypesType.ARRAYOF, caption, value });
  }

  return createTypeDef({ name: PropTypesType.ARRAYOF, caption: braceAfter(value) });
}

function generateType(type: PropType, extractedProp: ExtractedProp): TypeDef {
  try {
    switch (type.name) {
      case PropTypesType.CUSTOM:
        return generateCustom(type);
      case PropTypesType.FUNC:
        return generateFunc(extractedProp);
      case PropTypesType.SHAPE:
        return generateShape(type, extractedProp);
      case PropTypesType.INSTANCEOF:
        return createTypeDef({ name: PropTypesType.INSTANCEOF, caption: type.value });
      case PropTypesType.OBJECTOF:
        return generateObjectOf(type, extractedProp);
      case PropTypesType.UNION:
        return generateUnion(type, extractedProp);
      case PropTypesType.ENUM:
        return generateEnum(type);
      case PropTypesType.ARRAYOF:
        return generateArray(type, extractedProp);
      default:
        return createTypeDef({ name: type.name, caption: type.name });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  return createTypeDef({ name: 'unknown', caption: 'unknown' });
}

export function renderType(extractedProp: ExtractedProp): ReactNode {
  const type = extractedProp.docgenInfo.type as PropType;

  switch (type.name) {
    case PropTypesType.CUSTOM:
    case PropTypesType.SHAPE:
    case PropTypesType.INSTANCEOF:
    case PropTypesType.OBJECTOF:
    case PropTypesType.UNION:
    case PropTypesType.ENUM:
    case PropTypesType.ARRAYOF: {
      const { caption, value } = generateType(type, extractedProp);

      return createPropText(caption, { title: caption !== value ? value : undefined });
    }
    case PropTypesType.FUNC: {
      const { value } = generateType(type, extractedProp);

      return createPropText(value);
    }
    default:
      return null;
  }
}
