import { HttpService } from '@nestjs/axios';

export const CustomHttpProvider = {
  provide: 'CUSTOM_HTTP_SERVICE',
  useFactory: (...interceptors: Array<(axiosInstance: any) => void>) => {
    const httpService = new HttpService();
    interceptors.forEach((setupInterceptor) => {
      setupInterceptor(httpService.axiosRef);
    });
    return httpService;
  },
  inject: [],
};
