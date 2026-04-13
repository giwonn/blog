export { SeriesRequestSchema, type SeriesRequest, type Series } from "./types";
export {
  findAll as seriesFindAll,
  findById as seriesFindById,
  findBySlug as seriesFindBySlug,
  create as seriesCreate,
  update as seriesUpdate,
  deleteSeries as seriesDelete,
} from "./service";
