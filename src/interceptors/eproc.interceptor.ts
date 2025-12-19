import { AxiosInstance } from 'axios';
import { EprocService } from 'src/modules/eproc/eproc.service';

export function setupEprocInterceptor(eprocService: EprocService) {
  return (axiosInstance: AxiosInstance) => {
    axiosInstance.interceptors.request.use(async (config) => {
      const target = 'https://eproc1g-consulta.tjsp.jus.br/eproc';
      if (config.url?.startsWith(target)) {
        const sessionId = await eprocService.getSessionId();
        config.headers['Cookie'] = `PHPSESSID=${sessionId.cookie}`;
      }
      return config;
    });
  };
}
