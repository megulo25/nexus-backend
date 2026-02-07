/**
 * Paginate an array of items
 * @param {Array} items - Array of items to paginate
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Object} Paginated result with data and pagination info
 */
function paginate(items, page = 1, limit = 20) {
  const total = items.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const endIndex = startIndex + limit;
  const data = items.slice(startIndex, endIndex);

  return {
    data,
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

/**
 * Parse pagination query parameters with defaults
 * @param {Object} query - Express req.query object
 * @param {Object} defaults - Default values
 * @returns {Object} Parsed pagination parameters
 */
function parsePaginationParams(query, defaults = {}) {
  const {
    page: defaultPage = 1,
    limit: defaultLimit = 20,
    maxLimit = 1000,
  } = defaults;

  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  // Ensure valid values
  page = Number.isNaN(page) || page < 1 ? defaultPage : page;
  limit = Number.isNaN(limit) || limit < 1 ? defaultLimit : Math.min(limit, maxLimit);

  return { page, limit };
}

/**
 * Create a paginated response object
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination info
 * @returns {Object} Standardized response object
 */
function paginatedResponse(data, pagination) {
  return {
    success: true,
    data,
    pagination,
  };
}

module.exports = {
  paginate,
  parsePaginationParams,
  paginatedResponse,
};
