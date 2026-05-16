import * as React from "react";
import Select from "./Select";
import { useRouter } from "next/router";
import { CollectionData, FacetGroupData } from "interfaces";
import FormLabel from "components/form/FormLabel";
import useLinkUtils from "hooks/useLinkUtils";

const facetSortOrder: Record<string, number> = {
  all: 0,
  ebooks: 1,
  books: 1,
  audiobooks: 2,
  periodicals: 3
};

const ListFilters: React.FC<{ collection: CollectionData }> = ({
  collection
}) => {
  const { facetGroups } = collection;
  return (
    <div
      sx={{
        display: "flex",
        flexDirection: ["column", "row"],
        flexWrap: "wrap"
      }}
    >
      {facetGroups?.map(facetGroup => (
        <FacetSelector facetGroup={facetGroup} key={facetGroup.label} />
      ))}
    </div>
  );
};

const FacetSelector: React.FC<{
  facetGroup: FacetGroupData;
}> = ({ facetGroup }) => {
  const router = useRouter();
  const linkUtils = useLinkUtils();

  const { label, facets } = facetGroup;

  const displayFacetLabel = (facetLabel: string) => {
    return facetLabel.trim().toLowerCase() === "books" ? "Ebooks" : facetLabel;
  };

  const orderedFacets = React.useMemo(() => {
    return [...facets].sort((a, b) => {
      const aRank = facetSortOrder[a.label.trim().toLowerCase()] ?? 999;
      const bRank = facetSortOrder[b.label.trim().toLowerCase()] ?? 999;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.localeCompare(b.label);
    });
  }, [facets]);

  const activeFacet = facets.find(facet => !!facet.active);

  const handleChange = (e: React.FormEvent<HTMLSelectElement>) => {
    // just navigate to that facet.
    const facetLabel = e.currentTarget.value;
    const facet = facets.find(facet => facet.label === facetLabel);

    if (!facet?.href) return;
    const url = linkUtils.buildCollectionLink(facet.href);
    // shallow route because we don't need to rerun getStaticProps for the new page,
    // just fetch the new collection client-side
    router.push(url, undefined, { shallow: true });
  };
  return (
    <div sx={{ m: 1 }}>
      <FormLabel sx={{ mb: 0 }} htmlFor={`facet-selector-${label}`}>
        {label}
      </FormLabel>
      <Select
        id={`facet-selector-${label}`}
        value={activeFacet?.label}
        onBlur={handleChange}
        onChange={handleChange}
      >
        {orderedFacets.map(facet => (
          <option key={facet.label} value={facet.label}>
            {displayFacetLabel(facet.label)}
          </option>
        ))}
      </Select>
    </div>
  );
};
export default ListFilters;
