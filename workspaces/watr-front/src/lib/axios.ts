
import axios, {
  AxiosRequestConfig,
  AxiosInstance
} from "axios";

// (executable-find-prefer-node-modules "tsc")
export function configRequest(): AxiosRequestConfig {
  let auth = {};
  // if (runState && runState.credentials) {
  //   auth = {
  //     Authorization: `Bearer ${runState.credentials!.token}`
  //   };
  // }

  const config: AxiosRequestConfig = {
    baseURL: "http://localhost:3100/",
    headers: {
      ...auth
    },
    timeout: 10000,
    responseType: "json"
  };

  return config;
}

export function configAxios(): AxiosInstance {
  const conf = configRequest();
  return axios.create(conf);
}

// const config: AxiosRequestConfig = {
//   // url: '/user',
//   // method: 'get',
//   baseURL: 'https://localhost:3000/',
//   // transformRequest: (_: any) => '{"foo":"bar"}',
//   // transformResponse: [
//   //   (_: any) => ({ baz: 'qux' })
//   // ],
//   // headers: { 'User-Agent': 'test-create-script' },
//   headers: { 'User-Agent': 'cli' },
//   // params: { id: 12345 },
//   // paramsSerializer: (_: any) => 'id=12345',
//   // data: { foo: 'bar' },
//   timeout: 10000,
//   // withCredentials: true,
//   // auth: {
//   //   username: 'janedoe',
//   //   password: 's00pers3cret'
//   // },
//   responseType: 'json',
//   // xsrfCookieName: 'XSRF-TOKEN',
//   // xsrfHeaderName: 'X-XSRF-TOKEN',
//   // onUploadProgress: (_: any) => {},
//   // onDownloadProgress: (_: any) => {},
//   // maxContentLength: 2000,
//   // validateStatus: (status: number) => status >= 200 && status < 300,
//   // maxRedirects: 5,
//   // proxy: {
//   //   host: '127.0.0.1',
//   //   port: 9000
//   // },
//   // cancelToken: new axios.CancelToken((_: Canceler) => {})
// };
