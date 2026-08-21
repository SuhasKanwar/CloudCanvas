from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from config.agent import AGENT_CONFIG

wrapper = DuckDuckGoSearchAPIWrapper(region="us-en")
search_tool = DuckDuckGoSearchResults(api_wrapper=wrapper, num_results=AGENT_CONFIG["MAX_SEARCH_RESULTS"])
