export type ReaderSearchResult = {
  cfi: string;
  excerpt: string;
};

export const performBookSearch = async (
  book: any,
  query: string
): Promise<ReaderSearchResult[]> => {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || !book?.spine?.spineItems) return [];

  const searchPromises = book.spine.spineItems.map((item: any) =>
    item.load(book.load.bind(book)).then(
      () => {
        try {
          const results = item.find(trimmedQuery);
          return Promise.resolve(results);
        } catch {
          return Promise.resolve([]);
        } finally {
          item.unload();
        }
      },
      () => {
        try {
          item.unload();
        } catch {
          // ignore unload errors
        }
        return Promise.resolve([]);
      }
    )
  );
  const nestedResults = await Promise.all(searchPromises);
  return ([] as any[]).concat(...nestedResults);
};
