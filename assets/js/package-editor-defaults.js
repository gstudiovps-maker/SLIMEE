/**
 * Default product editor values for new packages.
 */
window.SLIMEE_PACKAGE_DEFAULTS = {
  detailIntro:
    "Describe what this resource does, who it is for, and what players or staff get after install.",
  detailSections: [
    {
      title: "About this resource",
      paragraphs: [
        "Replace this with a short overview of your script, map, MLO, or pack."
      ]
    },
    {
      title: "Key features",
      bullets: [
        "Optimized for live servers",
        "Clean configuration",
        "Documented install steps",
        "Support via Discord"
      ]
    }
  ],
  escrowIgnore: ["config/*.lua", "shared/utils/*.lua"],
  tags: [],
  gallery: [],
  videoPreviewUrl: "",
  cardImage: ""
};
