import * as React from "react";
import { Container, Box } from "theme-ui";
import { Text, H2 } from "components/Text";
import Button from "components/Button";
import { resolveReaderAction } from "@thepalaceproject/reader";
import EpubReader from "./readers/EpubReader";
import PdfReader from "./readers/PdfReader";
import AudioReader from "./readers/AudioReader";

type ReaderEngineViewProps = {
  resolvedUrl: string;
  contentType: string;
  authToken?: string;
  title?: string;
  setLoading: (value: boolean) => void;
};

const parseContentType = (raw: string) => {
  const normalized = (raw || "").toLowerCase();
  const [type, ...params] = normalized.split(";");
  const profileParam = params
    .map(part => part.trim())
    .find(part => part.startsWith("profile="));
  const profile = profileParam
    ? profileParam.replace(/^profile=("|')?/, "").replace(/("|')?$/, "")
    : "";
  return { type: type.trim(), profile };
};

const ReaderEngineView: React.FC<ReaderEngineViewProps> = ({
  resolvedUrl,
  contentType,
  authToken,
  title,
  setLoading
}) => {
  const { type, profile } = parseContentType(contentType);
  const action = resolveReaderAction([
    {
      href: resolvedUrl,
      type,
      profile
    }
  ]);

  if (!action) {
    return (
      <Container sx={{ py: 4 }}>
        <H2>Unsupported format</H2>
        <Text sx={{ mt: 3 }}>
          This content type is not supported for in-app reading.
        </Text>
      </Container>
    );
  }

  if (action.engine === "webview") {
    setLoading(false);
    return (
      <Box sx={{ flex: 1, height: "100%", minHeight: "70vh" }}>
        <iframe
          title="Webview reader"
          src={resolvedUrl}
          style={{ border: "none", width: "100%", height: "100%" }}
        />
      </Box>
    );
  }

  if (action.engine === "external") {
    setLoading(false);
    return (
      <Container sx={{ py: 4 }}>
        <H2>External reader required</H2>
        <Text sx={{ mt: 3 }}>
          This title cannot be read inside the app. Please open it in an
          external reader.
        </Text>
        <Button
          sx={{ mt: 3 }}
          onClick={() => window.open(resolvedUrl, "_blank")}
        >
          Open External Reader
        </Button>
      </Container>
    );
  }

  if (action.engine === "epubjs") {
    return (
      <EpubReader
        url={resolvedUrl}
        authToken={authToken}
        title={title}
        setLoading={setLoading}
      />
    );
  }

  if (action.engine === "pdfjs") {
    return (
      <PdfReader
        url={resolvedUrl}
        authToken={authToken}
        title={title}
        setLoading={setLoading}
      />
    );
  }

  if (action.engine === "audiobook") {
    return (
      <AudioReader
        url={resolvedUrl}
        authToken={authToken}
        title={title}
        setLoading={setLoading}
      />
    );
  }

  setLoading(false);
  return (
    <Container sx={{ py: 4 }}>
      <H2>Reader not available</H2>
      <Text sx={{ mt: 3 }}>
        Engine <strong>{action.engine}</strong> is not yet wired.
      </Text>
    </Container>
  );
};

export default ReaderEngineView;
