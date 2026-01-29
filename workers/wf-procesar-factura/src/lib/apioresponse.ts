import { getR2Json } from "./storage";

export type DatosGenerales = {
  nombre_proveedor: string;
  nif_proveedor: string;
  numero_factura: string;
  fecha_emision: string;
  moneda: string;
  importe_base_total: number;
  importe_impuestos_total: number;
  importe_retencion_total: number;
  importe_total: number;
  observaciones: string;
};

export type LineaFactura = {
  descripcion: string;
  codigo_producto: string;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  importe_base: number;
  importe_impuesto: number;
  importe_total_linea: number;
};

export type RO = {
  datos_generales: DatosGenerales;
  lineas: LineaFactura[];
};

export type ValidationInvalidField = {
  campo: string;
  valor: unknown;
  motivo: string;
};

export class ValidationFailure extends Error {
  tipo_error:
    | "estructura_ro_invalida"
    | "campo_obligatorio_faltante"
    | "campo_obligatorio_invalido"
    | "error_lectura_r2"
    | "apioresponse_inexistente";
  descripcion: string;
  campos_faltantes: string[];
  campos_invalidos: ValidationInvalidField[];

  constructor(params: {
    tipo_error: ValidationFailure["tipo_error"];
    descripcion: string;
    campos_faltantes?: string[];
    campos_invalidos?: ValidationInvalidField[];
  }) {
    super(params.descripcion);
    this.tipo_error = params.tipo_error;
    this.descripcion = params.descripcion;
    this.campos_faltantes = params.campos_faltantes ?? [];
    this.campos_invalidos = params.campos_invalidos ?? [];
  }
}

const REQ_DATOS_GENERALES: Array<keyof DatosGenerales> = [
  "nombre_proveedor",
  "nif_proveedor",
  "numero_factura",
  "fecha_emision",
  "moneda",
  "importe_base_total",
  "importe_impuestos_total",
  "importe_retencion_total",
  "importe_total",
  "observaciones"
];

const REQ_LINEA: Array<keyof LineaFactura> = [
  "descripcion",
  "codigo_producto",
  "cantidad",
  "precio_unitario",
  "porcentaje_iva",
  "importe_base",
  "importe_impuesto",
  "importe_total_linea"
];

export async function loadApioResponseOutput(r2: any, r2Prefix: string, invoiceId: string) {
  const key = `${r2Prefix}/${invoiceId}/facturas-extraer-texto.json`;
  const documento = await getR2Json<any>(r2, key);
  if (!documento) {
    throw new ValidationFailure({
      tipo_error: "apioresponse_inexistente",
      descripcion: `No se encontró facturas-extraer-texto.json en R2 para invoiceId=${invoiceId}`
    });
  }
  if (!documento.apioResponse || typeof documento.apioResponse !== "object") {
    throw new ValidationFailure({
      tipo_error: "apioresponse_inexistente",
      descripcion: "El documento en R2 no contiene apioResponse"
    });
  }
  if (documento.apioResponse.output === undefined || documento.apioResponse.output === null) {
    throw new ValidationFailure({
      tipo_error: "apioresponse_inexistente",
      descripcion: "apioResponse.output no existe en el documento R2"
    });
  }

  let output = documento.apioResponse.output;

  // Si output es un array (respuesta de OpenAI con output[0].content[0].text), extraer el JSON
  if (Array.isArray(output) && output.length > 0) {
    const firstItem = output[0];
    if (firstItem?.content && Array.isArray(firstItem.content) && firstItem.content.length > 0) {
      const textContent = firstItem.content[0];
      if (textContent?.text && typeof textContent.text === "string") {
        try {
          output = JSON.parse(textContent.text);
        } catch (e) {
          throw new ValidationFailure({
            tipo_error: "estructura_ro_invalida",
            descripcion: `No se pudo parsear el JSON en output[0].content[0].text: ${e}`
          });
        }
      }
    }
  }

  return output;
}

export function validateAndNormalizeRO(ro: any): RO {
  if (!ro || typeof ro !== "object" || Array.isArray(ro)) {
    throw new ValidationFailure({
      tipo_error: "estructura_ro_invalida",
      descripcion: "RO no es un objeto válido"
    });
  }
  const allowedKeys = ["datos_generales", "lineas"];
  const extraKeys = Object.keys(ro).filter((k) => !allowedKeys.includes(k));
  if (extraKeys.length) {
    throw new ValidationFailure({
      tipo_error: "estructura_ro_invalida",
      descripcion: `RO contiene claves no permitidas: ${extraKeys.join(",")}`
    });
  }

  const faltantes: string[] = [];
  const invalidos: ValidationInvalidField[] = [];

  const dgRaw = ro.datos_generales;
  if (!dgRaw || typeof dgRaw !== "object" || Array.isArray(dgRaw)) {
    throw new ValidationFailure({
      tipo_error: "estructura_ro_invalida",
      descripcion: "datos_generales no es un objeto"
    });
  }

  const dg: Partial<DatosGenerales> = {};
  for (const campo of REQ_DATOS_GENERALES) {
    const valor = (dgRaw as any)[campo];
    if (valor === undefined || valor === null) {
      faltantes.push(`datos_generales.${campo}`);
      continue;
    }
    if (isNumberField(campo)) {
      const numero = toNumber(valor);
      if (numero === null) {
        invalidos.push({ campo: `datos_generales.${campo}`, valor, motivo: "No es numérico convertible" });
      } else {
        (dg as any)[campo] = numero;
      }
    } else {
      try {
        (dg as any)[campo] = toStringValue(valor);
      } catch (e: any) {
        invalidos.push({ campo: `datos_generales.${campo}`, valor, motivo: e.message ?? "Valor no convertible a texto" });
      }
    }
  }

  const lineasRaw = ro.lineas;
  if (!Array.isArray(lineasRaw)) {
    throw new ValidationFailure({
      tipo_error: "estructura_ro_invalida",
      descripcion: "lineas no es un array"
    });
  }

  const lineas: LineaFactura[] = [];
  lineasRaw.forEach((lineaRaw: any, idx: number) => {
    if (!lineaRaw || typeof lineaRaw !== "object" || Array.isArray(lineaRaw)) {
      invalidos.push({ campo: `lineas[${idx}]`, valor: lineaRaw, motivo: "Linea no es objeto" });
      return;
    }
    const linea: Partial<LineaFactura> = {};
    for (const campo of REQ_LINEA) {
      const valor = (lineaRaw as any)[campo];
      if (valor === undefined || valor === null) {
        faltantes.push(`lineas[${idx}].${campo}`);
        continue;
      }
      if (isNumberField(campo)) {
        const numero = toNumber(valor);
        if (numero === null) {
          invalidos.push({ campo: `lineas[${idx}].${campo}`, valor, motivo: "No es numérico convertible" });
        } else {
          (linea as any)[campo] = numero;
        }
      } else {
        try {
          (linea as any)[campo] = toStringValue(valor);
        } catch (e: any) {
          invalidos.push({ campo: `lineas[${idx}].${campo}`, valor, motivo: e.message ?? "Valor no convertible a texto" });
        }
      }
    }
    if (Object.keys(linea).length === REQ_LINEA.length) {
      lineas.push(linea as LineaFactura);
    }
  });

  if (faltantes.length || invalidos.length) {
    const tipo_error = faltantes.length ? "campo_obligatorio_faltante" : "campo_obligatorio_invalido";
    const descripcion = faltantes.length
      ? "Faltan campos obligatorios en RO"
      : "Hay campos obligatorios con valor inválido en RO";
    throw new ValidationFailure({ tipo_error, descripcion, campos_faltantes: faltantes, campos_invalidos: invalidos });
  }

  return {
    datos_generales: dg as DatosGenerales,
    lineas
  };
}

export function buildValidationErrorPayload(params: {
  tipo_error: ValidationFailure["tipo_error"];
  descripcion: string;
  invoiceId: string;
  archivo: { nombre_original: string; r2_pdf_key: string; file_url: string };
  campos_faltantes?: string[];
  campos_invalidos?: ValidationInvalidField[];
  fecha_error?: string;
  origen?: string;
}) {
  return {
    tipo_error: params.tipo_error,
    descripcion: params.descripcion,
    origen: params.origen ?? "lectura-apioresponse",
    invoiceId: params.invoiceId,
    archivo: {
      nombre_original: params.archivo.nombre_original,
      r2_pdf_key: params.archivo.r2_pdf_key,
      file_url: params.archivo.file_url
    },
    detalle_validacion: {
      campos_faltantes: params.campos_faltantes ?? [],
      campos_invalidos: params.campos_invalidos ?? []
    },
    fecha_error: params.fecha_error ?? new Date().toISOString()
  };
}

export function buildErrorPath(r2Prefix: string, invoiceId: string) {
  return `${r2Prefix}/${invoiceId}/error_validacion_factura.json`;
}

function isNumberField(campo: string) {
  return [
    "importe_base_total",
    "importe_impuestos_total",
    "importe_retencion_total",
    "importe_total",
    "cantidad",
    "precio_unitario",
    "porcentaje_iva",
    "importe_base",
    "importe_impuesto",
    "importe_total_linea"
  ].includes(campo);
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error("Valor no convertible a texto");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
