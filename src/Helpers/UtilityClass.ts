export default class UtilityClass {
  public static parseDate(input: string): Date {
    const clean = input.replace(/\s+/g, ''); // remove qualquer espaço
    const [dia, mes, ano] = clean.split('/');
    return new Date(Number(ano), Number(mes) - 1, Number(dia));
  }
}
