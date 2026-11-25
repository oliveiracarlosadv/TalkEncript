// Validação e formatação dos dados do operador.

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const onlyDigits = (value) => String(value ?? '').replace(/\D+/g, '');

/** Valida o CPF pelos dígitos verificadores (algoritmo da Receita Federal). */
export function isValidCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCPF(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** Valida o CNPJ pelos dígitos verificadores. */
export function isValidCNPJ(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((t, w, i) => t + w * Number(cnpj[i]), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function formatCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** CNPJ ou CPF, conforme a quantidade de dígitos digitados. */
export const formatCNPJorCPF = (value) => (onlyDigits(value).length > 11 ? formatCNPJ(value) : formatCPF(value));
export const isValidCNPJorCPF = (value) => (onlyDigits(value).length > 11 ? isValidCNPJ(value) : isValidCPF(value));

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
}

/** Celular brasileiro: DDD válido e nove dígitos começando por 9. */
export function isValidMobile(value) {
  let d = onlyDigits(value);
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  return d.length === 11 && /^[1-9][1-9]9\d{8}$/.test(d);
}

export function formatMobile(value) {
  let d = onlyDigits(value);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Número de inscrição na OAB: até seis dígitos, aceitando sufixo de suplementar (ex.: 12345-A). */
export function isValidOAB(number, uf) {
  const n = String(number ?? '').trim().toUpperCase();
  return /^\d{1,6}(-?[A-Z])?$/.test(n) && UFS.includes(String(uf ?? '').toUpperCase());
}

export function formatOAB(number, uf) {
  const n = String(number ?? '').trim().toUpperCase();
  const digits = n.match(/^\d+/)?.[0] ?? '';
  const suffix = n.slice(digits.length).replace('-', '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `OAB/${String(uf).toUpperCase()} ${grouped}${suffix ? `-${suffix}` : ''}`;
}

/** IMEI: 15 dígitos, com o último conferido pelo algoritmo de Luhn. */
export function isValidIMEI(value) {
  const d = onlyDigits(value);
  if (d.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Exibe apenas os 4 primeiros e os 3 últimos dígitos do IMEI. */
export function maskIMEI(value) {
  const d = onlyDigits(value);
  if (d.length < 8) return null;
  return `${d.slice(0, 4)} ${'•'.repeat(d.length - 7)} ${d.slice(-3)}`;
}

/** Endereço de internet completo, com http:// ou https://. */
export function isValidUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Acrescenta https:// quando o usuário digita apenas www.exemplo.com.br. */
export function normalizeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

/** Valida o cadastro completo e devolve a lista de erros (vazia se estiver tudo certo). */
export function validateOperator(op) {
  const errors = {};
  const name = String(op.nome ?? '').trim();
  if (name.split(/\s+/).filter(Boolean).length < 2) errors.nome = 'Informe o nome completo.';
  if (!isValidEmail(op.email)) errors.email = 'Informe um endereço eletrônico válido.';
  if (!isValidMobile(op.celular)) errors.celular = 'Informe um celular válido com DDD, por exemplo (91) 98888-7777.';
  if (!isValidCPF(op.cpf)) errors.cpf = 'CPF inválido. Confira os dígitos.';
  if (String(op.profissao ?? '').trim().length < 3) errors.profissao = 'Informe a profissão do operador.';
  const links = op.links ?? [];
  if (links.some((l) => (l.titulo && !l.url) || (!l.titulo && l.url))) errors.links = 'Preencha o título e o endereço de cada link, ou deixe os dois em branco.';
  else if (links.some((l) => l.url && !isValidUrl(l.url))) errors.links = 'Endereço de link inválido. Use o endereço completo, começando por https://.';
  // Escritório ou empresa: campos opcionais; o documento, se informado, precisa ser válido.
  if (String(op.empresaDocumento ?? '').trim() && !isValidCNPJorCPF(op.empresaDocumento)) errors.empresaDocumento = 'CNPJ ou CPF inválido. Confira os dígitos ou deixe o campo em branco.';
  if (op.advogado) {
    if (!isValidOAB(op.oabNumero, op.oabUF)) errors.oab = 'Informe o número da OAB e a seccional (UF).';
  }
  if (!op.consentimento) errors.consentimento = 'É necessário aceitar o tratamento dos dados para emitir relatórios.';
  return errors;
}
