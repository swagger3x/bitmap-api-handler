import axios from "axios";
import { config } from "../config/env";
import { IBitmap } from "../models/Bitmap";

export interface ExternalApiResponse {
  data: IBitmap[];
  blockHeight: Number;
}

export class BestApiService {
  static async fetchBitmaps(
    sort_by: string = "inscr_num",
    order: string = "asc",
    offset: number,
    count: number = 100
  ): Promise<any> {
    try {
      const response = await axios.get(config.bestApiUrl, {
        params: {
          sort_by,
          order,
          offset,
          count,
        },
        headers: {
          "x-api-key": config.bestApiKey,
        },
        timeout: 10000, // 10 seconds timeout
      });

      return response;
    } catch (error) {
      console.error("Error fetching data from external API:", error);
      throw new Error("Failed to fetch data from external API");
    }
  }
}
