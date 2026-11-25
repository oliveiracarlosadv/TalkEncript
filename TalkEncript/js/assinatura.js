// Assinatura digital do relatório em PDF com o certificado A1 (arquivo .pfx ou .p12) do
// operador, no padrão PAdES (assinatura CAdES destacada embutida no PDF), feita no próprio
// computador: o certificado e a senha não saem do navegador e não são guardados.
//
// Estrutura da assinatura (RFC 5652 e ETSI EN 319 142-1, PAdES B-B):
// - atributos assinados: tipo de conteúdo, resumo SHA-256 dos trechos do PDF e
//   signing-certificate-v2 (identifica o certificado do signatário, exigido no PAdES);
// - algoritmo RSA com SHA-256; certificados da cadeia contidos no arquivo .pfx;
// - a data e a hora da assinatura ficam no campo /M do dicionário de assinatura do PDF.

import forge from '../vendor/forge.esm.js';
import { PDFDocument, PDFName, PDFHexString, PDFString } from '../vendor/pdf-lib.esm.min.js';

const { asn1 } = forge;

// Números aleatórios (usados na proteção da chave RSA durante a assinatura) vêm do gerador
// seguro do sistema (Web Crypto), disponível no navegador e no Node.js.
const randomBinary = (n) => {
  let s = '';
  for (let left = n; left > 0; left -= 65536) {
    const chunk = globalThis.crypto.getRandomValues(new Uint8Array(Math.min(left, 65536)));
    s += String.fromCharCode.apply(null, chunk);
  }
  return s;
};
forge.random.getBytesSync = randomBinary;
forge.random.getBytes = (n, callback) => (callback ? callback(null, randomBinary(n)) : randomBinary(n));
const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
  // Dados do titular no certificado ICP-Brasil (DOC-ICP-04): pessoa física e pessoa jurídica.
  icpPessoaFisica: '2.16.76.1.3.1',
  icpCnpj: '2.16.76.1.3.3',
  icpResponsavelPj: '2.16.76.1.3.4',
};
// Espaço reservado no PDF para a assinatura (bytes); a cadeia ICP-Brasil completa ocupa
// cerca de 6 a 8 KB.
const ESPACO = 24000;

export class CertificadoError extends Error {}

const bytesToBinary = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
};
const binaryToBytes = (bin) => Uint8Array.from(bin, (c) => c.charCodeAt(0));
const seq = (...v) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, v);
const set = (...v) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, v);
const oid = (o) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(o).getBytes());
const nul = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
const octets = (bin) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bin);
const integerRaw = (hex) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.hexToBytes(hex));
const integer = (n) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(n).getBytes());
const algorithm = (o) => seq(oid(o), nul());
const der = (node) => asn1.toDer(node).getBytes();
const sha256 = (bin) => forge.md.sha256.create().update(bin).digest().getBytes();

/** DER original do certificado (o mesmo que está no arquivo .pfx). */
const certDer = (cert) => der(forge.pki.certificateToAsn1(cert));

/** Valor de um "otherName" do subjectAltName (texto), ou null. */
function otherName(cert, wanted) {
  const ext = cert.extensions?.find((e) => e.name === 'subjectAltName');
  if (!ext?.value) return null;
  try {
    const names = asn1.fromDer(ext.value);
    for (const gn of names.value) {
      if (gn.tagClass !== asn1.Class.CONTEXT_SPECIFIC || gn.type !== 0) continue;
      const [id, wrapped] = gn.value;
      if (asn1.derToOid(id.value) !== wanted) continue;
      const inner = wrapped.value[0];
      return typeof inner.value === 'string' ? inner.value : null;
    }
  } catch { /* extensão em formato inesperado */ }
  return null;
}

const attr = (cert, shortName) => cert.subject.getField(shortName)?.value ?? null;
const issuerAttr = (cert, shortName) => cert.issuer.getField(shortName)?.value ?? null;
const formatCpf = (d) => (/^\d{11}$/.test(d) ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
const formatCnpj = (d) => (/^\d{14}$/.test(d) ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d);

/** Dados legíveis do titular e do certificado, para o relatório e para a tela. */
export function describeCertificate(cert, cadeia = []) {
  const cn = attr(cert, 'CN') ?? '';
  // No ICP-Brasil, o nome comum é "NOME DO TITULAR:CPF" (e-CPF) ou "RAZÃO SOCIAL:CNPJ" (e-CNPJ).
  const [nomeCn, docCn] = cn.split(':');
  const pf = otherName(cert, OID.icpPessoaFisica);
  const cnpjOn = otherName(cert, OID.icpCnpj);
  const cpf = pf && /^\d{8}(\d{11})/.test(pf) ? pf.slice(8, 19) : docCn && /^\d{11}$/.test(docCn) ? docCn : null;
  const cnpj = cnpjOn && /^\d{14}/.test(cnpjOn) ? cnpjOn.slice(0, 14) : docCn && /^\d{14}$/.test(docCn) ? docCn : null;
  const orgs = [cert, ...cadeia].flatMap((c) => [attr(c, 'O'), issuerAttr(c, 'O')]).filter(Boolean);
  return {
    titular: (nomeCn || cn).trim(),
    cpf: cpf ? formatCpf(cpf) : null,
    cnpj: cnpj ? formatCnpj(cnpj) : null,
    tipo: cnpj ? 'e-CNPJ' : cpf ? 'e-CPF' : 'certificado digital',
    emissor: issuerAttr(cert, 'CN') ?? 'não informado',
    icpBrasil: orgs.some((o) => /ICP-Brasil/i.test(o)),
    numeroSerie: cert.serialNumber.replace(/^0+(?=.)/, '').toUpperCase(),
    validoDe: cert.validity.notBefore.toISOString(),
    validoAte: cert.validity.notAfter.toISOString(),
    sha256: forge.util.bytesToHex(sha256(certDer(cert))),
  };
}

/**
 * Abre o arquivo .pfx/.p12 com a senha e devolve a chave, o certificado do titular, a cadeia
 * e os dados do titular. Erros de senha, de formato e de validade vêm como CertificadoError.
 */
export function readCertificate(bytes, senha, agora = new Date()) {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(bytesToBinary(bytes)), senha ?? '');
  } catch (error) {
    const msg = String(error?.message ?? error);
    if (/MAC could not be verified|Invalid password|decrypt/i.test(msg)) throw new CertificadoError('senha do certificado incorreta.');
    throw new CertificadoError(`o arquivo não é um certificado A1 válido (.pfx ou .p12): ${msg}`);
  }
  const keys = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].map((b) => b.key).filter(Boolean);
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter(Boolean);
  if (!keys.length) throw new CertificadoError('o arquivo não contém a chave privada (é preciso o certificado A1 completo, com a chave).');
  if (!certs.length) throw new CertificadoError('o arquivo não contém certificados, ou usa um tipo de chave não suportado (somente RSA).');
  const chave = keys[0];
  if (!chave.n) throw new CertificadoError('tipo de chave não suportado: somente certificados RSA.');
  const certificado = certs.find((c) => c.publicKey?.n && c.publicKey.n.equals(chave.n));
  if (!certificado) throw new CertificadoError('a chave privada não corresponde a nenhum certificado do arquivo.');
  if (agora < certificado.validity.notBefore) throw new CertificadoError(`o certificado ainda não é válido (válido a partir de ${certificado.validity.notBefore.toLocaleDateString('pt-BR')}).`);
  if (agora > certificado.validity.notAfter) throw new CertificadoError(`o certificado está vencido desde ${certificado.validity.notAfter.toLocaleDateString('pt-BR')}.`);
  const cadeia = certs.filter((c) => c !== certificado);
  return { chave, certificado, cadeia, dados: describeCertificate(certificado, cadeia) };
}

/** CMS SignedData destacado (DER, texto binário) sobre os bytes indicados. */
export function buildCms(conteudo, { chave, certificado, cadeia }) {
  const tbs = certificado.tbsCertificate;
  // Com versão explícita ([0]), o emissor é o 4º elemento do TBSCertificate; sem ela, o 3º.
  const offset = tbs.value[0].tagClass === asn1.Class.CONTEXT_SPECIFIC ? 1 : 0;
  const emissor = tbs.value[offset + 2];
  const serie = tbs.value[offset];
  const assinanteDer = certDer(certificado);

  const essCertIdV2 = seq(
    octets(sha256(assinanteDer)),
    seq(seq(asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [emissor])), serie),
  );
  const atributos = [
    seq(oid(OID.contentType), set(oid(OID.data))),
    seq(oid(OID.messageDigest), set(octets(sha256(conteudo)))),
    seq(oid(OID.signingCertificateV2), set(seq(seq(essCertIdV2)))),
  ];
  // DER: os elementos de um SET OF ficam em ordem crescente de codificação.
  atributos.sort((a, b) => (der(a) < der(b) ? -1 : der(a) > der(b) ? 1 : 0));
  const assinados = set(...atributos);
  const md = forge.md.sha256.create();
  md.update(der(assinados));
  const assinatura = chave.sign(md);

  const signerInfo = seq(
    integer(1),
    seq(emissor, serie),
    algorithm(OID.sha256),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, assinados.value),
    algorithm(OID.rsaEncryption),
    octets(assinatura),
  );
  const certificados = [certificado, ...cadeia].map((c) => forge.pki.certificateToAsn1(c));
  const signedData = seq(
    integer(1),
    set(algorithm(OID.sha256)),
    seq(oid(OID.data)),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, certificados),
    set(signerInfo),
  );
  return der(seq(oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])));
}

const indexOf = (bytes, text, from = 0) => {
  const pattern = new TextEncoder().encode(text);
  outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let k = 0; k < pattern.length; k++) if (bytes[i + k] !== pattern[k]) continue outer;
    return i;
  }
  return -1;
};

/**
 * Assina o PDF. `credencial` é o retorno de readCertificate.
 * @param opcoes { motivo, local, contato, momento (Date) }
 * @returns Uint8Array com o PDF assinado
 */
export async function signPdf(pdfBytes, credencial, opcoes = {}) {
  const momento = opcoes.momento ?? new Date();
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = doc.context;
  const marca = PDFName.of('**********');
  const sigDict = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'ETSI.CAdES.detached',
    ByteRange: [0, marca, marca, marca],
    Contents: PDFHexString.of('0'.repeat(ESPACO * 2)),
    M: PDFString.fromDate(momento),
    Name: PDFHexString.fromText(credencial.dados.titular),
    ...(opcoes.motivo ? { Reason: PDFHexString.fromText(opcoes.motivo) } : {}),
    ...(opcoes.local ? { Location: PDFHexString.fromText(opcoes.local) } : {}),
    ...(opcoes.contato ? { ContactInfo: PDFHexString.fromText(opcoes.contato) } : {}),
  });
  const sigRef = ctx.register(sigDict);
  const pagina = doc.getPage(0);
  const widgetRef = ctx.register(ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: [0, 0, 0, 0],
    V: sigRef,
    T: PDFHexString.fromText('Assinatura do operador'),
    F: 132,
    P: pagina.ref,
  }));
  const annots = pagina.node.lookup(PDFName.of('Annots'));
  if (annots) annots.push(widgetRef); else pagina.node.set(PDFName.of('Annots'), ctx.obj([widgetRef]));
  doc.catalog.set(PDFName.of('AcroForm'), ctx.register(ctx.obj({ Fields: [widgetRef], SigFlags: 3 })));

  const bytes = await doc.save({ useObjectStreams: false });
  // Localiza o espaço do /ByteRange e do /Contents no arquivo salvo.
  const marcaInicio = indexOf(bytes, '/**********');
  const abre = bytes.lastIndexOf(0x5b, marcaInicio); // [
  const fecha = bytes.indexOf(0x5d, marcaInicio); // ]
  const contInicio = indexOf(bytes, `<${'0'.repeat(64)}`);
  const contFim = indexOf(bytes, '>', contInicio) + 1;
  if (marcaInicio < 0 || abre < 0 || fecha < 0 || contInicio < 0 || contFim <= 0) throw new Error('não foi possível preparar o PDF para a assinatura.');
  const range = [0, contInicio, contFim, bytes.length - contFim];
  const rangeText = `[${range.join(' ')}]`;
  if (rangeText.length > fecha - abre + 1) throw new Error('espaço insuficiente para o intervalo da assinatura.');
  bytes.set(new TextEncoder().encode(rangeText.padEnd(fecha - abre + 1, ' ')), abre);

  const conteudo = new Uint8Array(range[1] + range[3]);
  conteudo.set(bytes.subarray(0, range[1]));
  conteudo.set(bytes.subarray(range[2]), range[1]);
  const cms = buildCms(bytesToBinary(conteudo), credencial);
  const hex = forge.util.bytesToHex(cms);
  if (hex.length > ESPACO * 2) throw new Error('a assinatura não coube no espaço reservado no PDF.');
  bytes.set(new TextEncoder().encode(hex), contInicio + 1);
  return bytes;
}

/** Intervalos e assinatura de um PDF assinado (para conferência nos testes e na tela). */
export function extractSignature(bytes) {
  const texto = new TextDecoder('latin1').decode(bytes);
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(texto);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  const espaco = binaryToBytes(forge.util.hexToBytes(texto.slice(b + 1, c - 1)));
  // Tamanho real do CMS pelo cabeçalho DER (SEQUENCE com comprimento em 1 a 4 bytes).
  const n = espaco[1] & 0x80 ? espaco[1] & 0x7f : 0;
  const len = n ? [...espaco.subarray(2, 2 + n)].reduce((t, x) => t * 256 + x, 0) + 2 + n : espaco[1] + 2;
  const conteudo = new Uint8Array(b + d);
  conteudo.set(bytes.subarray(a, a + b));
  conteudo.set(bytes.subarray(c, c + d), b);
  return { range: [a, b, c, d], conteudo, cms: espaco.slice(0, len) };
}
