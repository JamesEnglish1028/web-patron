import * as React from "react";
import LoadingIndicator from "../LoadingIndicator";
import { H3, H2 } from "components/Text";
import Lane from "components/Lane";
import { AnyBook } from "interfaces";
import { fetchCollection } from "dataflow/opds1/fetch";
import useSWR from "swr";
import useUser from "components/context/UserContext";

const Recommendations: React.FC<{ book: AnyBook }> = ({ book }) => {
  const relatedUrl = book.relatedUrl;
  const { token } = useUser();

  const { data: recommendations, isValidating } = useSWR(
    relatedUrl ? [relatedUrl, token] : null,
    ([url, authToken]: readonly [string, string | undefined]) =>
      fetchCollection(url, authToken)
  );

  const isLoading = !recommendations && isValidating;

  // get the lanes data from state
  const lanes = recommendations?.lanes ?? [];

  // don't show if there are no lanes
  if (!isLoading && lanes.length === 0) return null;
  // don't show if every lane only contains the current book or no books.
  // `Lane` also applies this omit filter at render time, so this gate must
  // account for the same logic to avoid hiding valid single-book lanes.
  const hasVisibleBooks = lanes.some(lane =>
    lane.books.some(laneBook => laneBook.id !== book.id)
  );
  if (!isLoading && !hasVisibleBooks) return null;

  return (
    <section sx={{ bg: "ui.gray.lightWarm", py: 4 }}>
      <H2
        sx={{
          px: [3, 5],
          mt: 0,
          mb: 3,
          color: isLoading ? "ui.gray.dark" : "ui.black"
        }}
      >
        Recommendations{" "}
        {isLoading && (
          // @ts-expect-error theme-ui Spinner typing expects numeric size
          <LoadingIndicator size="1.75rem" color="ui.gray.dark" />
        )}
      </H2>
      <ul sx={{ listStyle: "none", m: 0, p: 0 }}>
        {!isLoading &&
          lanes.map(lane => {
            return (
              <Lane
                key={lane.title}
                lane={lane}
                titleTag={H3}
                omitIds={[book.id]}
              />
            );
          })}
      </ul>
    </section>
  );
};

export default Recommendations;
